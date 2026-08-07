/**
 * Galerie photos — bucket Supabase Storage « galerie » + table galerie_photos.
 *
 * GET  /api/photos            -> { items } (public, lecture seule)
 * POST /api/photos            -> upload / reorder / setCategory / saveAll /
 *                                deleteMany / sync   (JWT admin requis)
 * DELETE /api/photos?name=... -> suppression unitaire (JWT admin requis)
 *
 * Le GET public ne fait aucun appel reseau par photo : les URLs sont
 * construites localement a partir de l'URL publique du bucket. Avant, chaque
 * visite declenchait un listing du Storage plus une URL signee par image,
 * en sequentiel.
 */

const {
  readJsonBody,
  verifyAdminToken,
  getBearerToken,
  PayloadTooLargeError,
} = require("./_lib/auth");
const { json, preflight } = require("./_lib/http");
const { getSupabaseAdmin } = require("./_lib/supabase");

const BUCKET = "galerie";

/** Types d'images acceptes a l'upload. */
const ALLOWED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** 8 Mo par image, 40 Mo pour l'ensemble d'un envoi. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

/**
 * Signatures binaires : on verifie le contenu reel du fichier, pas seulement
 * le content-type annonce par le client.
 */
function sniffImageType(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  const riff = buffer.toString("ascii", 0, 4);
  const webp = buffer.toString("ascii", 8, 12);
  if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  const brand = buffer.toString("ascii", 4, 12);
  if (brand === "ftypavif" || brand === "ftypavis") return "image/avif";
  return null;
}

function requireAdmin(req, res) {
  const payload = verifyAdminToken(getBearerToken(req));
  if (!payload) {
    json(res, 401, { error: "Non autorisé." });
    return null;
  }
  return payload;
}

/** Nom d'objet sûr : ASCII, sans chemin, prefixe par un horodatage. */
function safeObjectName(originalName, ext) {
  const name = originalName || "image";
  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  let ascii = base;
  try {
    ascii = base.normalize("NFD").replace(/\p{M}/gu, "");
  } catch (e) {
    ascii = base;
  }
  let s = ascii
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) s = "image";
  if (s.length > 60) s = s.slice(0, 60).replace(/-+$/g, "") || "image";
  const suffix = Math.random().toString(36).slice(2, 8);
  return Date.now() + "-" + suffix + "-" + s + "." + ext;
}

/** Refuse tout nom pouvant sortir du bucket ou cibler un autre dossier. */
function isSafeStoredName(n) {
  return typeof n === "string" && !!n && !n.includes("..") && !n.includes("/") && !n.includes("\\");
}

function publicUrl(db, path) {
  const pub = db.storage.from(BUCKET).getPublicUrl(path);
  return (pub && pub.data && pub.data.publicUrl) || "";
}

/** Prochaine position libre dans une categorie donnee. */
async function nextPosition(db, categoryId) {
  let q = db.from("galerie_photos").select("position").order("position", { ascending: false }).limit(1);
  q = categoryId ? q.eq("category_id", categoryId) : q.is("category_id", null);
  const { data } = await q.maybeSingle();
  return (data && data.position != null ? data.position : -1) + 1;
}

/** Categorie par defaut : la premiere dans l'ordre d'affichage. */
async function defaultCategoryId(db) {
  const { data } = await db
    .from("categories")
    .select("id")
    .order("ordre", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? data.id : null;
}

async function ensureMeta(db, name, categoryId) {
  const { data: existing } = await db
    .from("galerie_photos")
    .select("name")
    .eq("name", name)
    .maybeSingle();
  if (existing) return;
  const cat = categoryId || (await defaultCategoryId(db));
  const position = await nextPosition(db, cat);
  await db.from("galerie_photos").insert([{ name, category_id: cat, position }]);
}

/**
 * Rattrape les fichiers presents dans le Storage mais absents de la table,
 * par exemple deposes directement depuis l'interface Supabase.
 * Reserve a l'admin : c'est une operation couteuse.
 */
async function syncStorageToMeta(db) {
  const { data: files, error } = await db.storage
    .from(BUCKET)
    .list("", { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
  if (error) return { added: 0, error: error.message };

  const names = (files || [])
    .filter((f) => f && f.name && f.metadata != null)
    .filter((f) => /\.(jpe?g|png|gif|webp|avif)$/i.test(f.name))
    .map((f) => f.name);
  if (!names.length) return { added: 0 };

  // Une seule requete pour savoir ce qui existe deja, au lieu d'une par fichier.
  const { data: known } = await db.from("galerie_photos").select("name").in("name", names);
  const knownSet = new Set((known || []).map((r) => r.name));
  const missing = names.filter((n) => !knownSet.has(n));
  if (!missing.length) return { added: 0 };

  const cat = await defaultCategoryId(db);
  let position = await nextPosition(db, cat);
  const rows = missing.map((name) => ({ name, category_id: cat, position: position++ }));
  await db.from("galerie_photos").insert(rows);
  return { added: rows.length };
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;

  const db = getSupabaseAdmin();
  if (!db) {
    return json(res, 503, { error: "Supabase non configuré.", items: [] });
  }

  /* ---------- Lecture publique ---------- */
  if (req.method === "GET") {
    const { data: cats } = await db
      .from("categories")
      .select("id, nom, ordre")
      .order("ordre", { ascending: true });
    const categories = cats || [];
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const catRank = new Map(categories.map((c, i) => [c.id, i]));

    const { data: rows, error } = await db
      .from("galerie_photos")
      .select("name, category_id, position, created_at")
      .order("position", { ascending: true });
    if (error) return json(res, 500, { error: error.message, items: [] });

    const items = (rows || []).map((row) => ({
      name: row.name,
      url: publicUrl(db, row.name),
      category_id: row.category_id,
      category: row.category_id ? catMap.get(row.category_id) || null : null,
      position: row.position,
      createdAt: row.created_at,
    }));

    // Tri final : ordre des categories, puis position dans la categorie.
    // Les photos sans categorie passent en dernier.
    items.sort((a, b) => {
      const ra = a.category_id != null && catRank.has(a.category_id) ? catRank.get(a.category_id) : 9999;
      const rb = b.category_id != null && catRank.has(b.category_id) ? catRank.get(b.category_id) : 9999;
      if (ra !== rb) return ra - rb;
      return (a.position || 0) - (b.position || 0);
    });

    return json(res, 200, { items, categories });
  }

  /* ---------- Ecriture : admin uniquement ---------- */
  if (!requireAdmin(req, res)) return;

  if (req.method === "POST") {
    let body = {};
    try {
      body = await readJsonBody(req, MAX_TOTAL_BYTES + 2 * 1024 * 1024);
    } catch (e) {
      if (e instanceof PayloadTooLargeError) {
        return json(res, 413, {
          error: "Envoi trop volumineux. Limite : 40 Mo au total, 8 Mo par image.",
        });
      }
      return json(res, 400, { error: "JSON invalide." });
    }

    // Rattrapage des fichiers deposes hors de l'interface.
    if (body.action === "sync") {
      const result = await syncStorageToMeta(db);
      return json(res, 200, { ok: true, ...result });
    }

    // Reordonner
    if (body.action === "reorder" && Array.isArray(body.order)) {
      const names = body.order.filter(isSafeStoredName);
      for (let i = 0; i < names.length; i++) {
        await db.from("galerie_photos").update({ position: i }).eq("name", names[i]);
      }
      return json(res, 200, { ok: true });
    }

    // Changer la categorie d'une photo
    if (body.action === "setCategory" && isSafeStoredName(body.name)) {
      const { error } = await db
        .from("galerie_photos")
        .update({ category_id: body.category_id || null })
        .eq("name", body.name);
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true });
    }

    // Enregistrement global : ordre + affectations de categorie
    if (body.action === "saveAll") {
      const assignments = Array.isArray(body.assignments) ? body.assignments : [];
      const catOf = new Map();
      for (const a of assignments) {
        if (a && isSafeStoredName(a.name)) catOf.set(a.name, a.category_id || null);
      }

      const order = Array.isArray(body.order) ? body.order.filter(isSafeStoredName) : [];
      // La position est relative a la categorie : on repart de zero pour chacune.
      const counters = new Map();
      for (const name of order) {
        const cat = catOf.has(name) ? catOf.get(name) : undefined;
        const key = cat === undefined ? "__unchanged__" : String(cat);
        const pos = counters.get(key) || 0;
        counters.set(key, pos + 1);
        const patch = { position: pos };
        if (cat !== undefined) patch.category_id = cat;
        await db.from("galerie_photos").update(patch).eq("name", name);
      }

      // Affectations sans ordre fourni
      for (const [name, cat] of catOf) {
        if (order.includes(name)) continue;
        await db.from("galerie_photos").update({ category_id: cat }).eq("name", name);
      }
      return json(res, 200, { ok: true });
    }

    // Suppression multiple
    if (body.action === "deleteMany" && Array.isArray(body.names)) {
      const names = body.names.filter(isSafeStoredName);
      if (names.length) {
        await db.storage.from(BUCKET).remove(names);
        await db.from("galerie_photos").delete().in("name", names);
      }
      return json(res, 200, { ok: true, deleted: names.length });
    }

    /* ---------- Upload ---------- */
    const files = Array.isArray(body.files) ? body.files : body.data ? [body] : [];
    if (!files.length) return json(res, 400, { error: "Fichier(s) manquant(s)." });
    if (files.length > 30) {
      return json(res, 400, { error: "30 images maximum par envoi." });
    }

    const uploaded = [];
    const rejected = [];
    let total = 0;

    for (const f of files) {
      const filename = typeof f.filename === "string" ? f.filename : "image.jpg";
      const b64 = typeof f.data === "string" ? f.data.replace(/^data:[^;]+;base64,/, "") : "";
      if (!b64) {
        rejected.push({ filename, raison: "contenu vide" });
        continue;
      }

      let buffer;
      try {
        buffer = Buffer.from(b64, "base64");
      } catch (e) {
        rejected.push({ filename, raison: "base64 invalide" });
        continue;
      }

      if (buffer.length > MAX_IMAGE_BYTES) {
        rejected.push({ filename, raison: "dépasse 8 Mo" });
        continue;
      }
      total += buffer.length;
      if (total > MAX_TOTAL_BYTES) {
        rejected.push({ filename, raison: "envoi total supérieur à 40 Mo" });
        break;
      }

      // On se fie a la signature binaire, pas au content-type declare.
      const realType = sniffImageType(buffer);
      if (!realType || !ALLOWED_TYPES[realType]) {
        rejected.push({ filename, raison: "format non supporté (JPEG, PNG, GIF, WebP, AVIF)" });
        continue;
      }

      const path = safeObjectName(filename, ALLOWED_TYPES[realType]);
      const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
        contentType: realType,
        upsert: false,
        cacheControl: "31536000",
      });
      if (error) {
        rejected.push({ filename, raison: error.message });
        continue;
      }

      await ensureMeta(db, path, f.category_id || body.category_id || null);
      uploaded.push({ name: path, url: publicUrl(db, path) });
    }

    if (!uploaded.length && rejected.length) {
      return json(res, 400, {
        error: "Aucune image n'a pu être envoyée.",
        rejected,
      });
    }
    return json(res, 201, { ok: true, items: uploaded, rejected });
  }

  if (req.method === "DELETE") {
    let names = [];
    if (req.query && req.query.name) names = [req.query.name];
    else {
      try {
        const body = await readJsonBody(req, 64 * 1024);
        if (body && body.name) names = [body.name];
        if (body && Array.isArray(body.names)) names = body.names;
      } catch (e) {
        /* corps optionnel */
      }
    }
    names = names.filter(isSafeStoredName);
    if (!names.length) return json(res, 400, { error: "Nom manquant." });
    await db.storage.from(BUCKET).remove(names);
    await db.from("galerie_photos").delete().in("name", names);
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée" });
};
