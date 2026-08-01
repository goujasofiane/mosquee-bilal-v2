const { readJsonBody, verifyAdminToken, getBearerToken } = require("./_lib/auth");
const { json, preflight, applyCors } = require("./_lib/http");
const { getSupabaseAdmin } = require("./_lib/supabase");

const BUCKET = "galerie";

function requireAdmin(req, res) {
  const payload = verifyAdminToken(getBearerToken(req));
  if (!payload) {
    json(res, 401, { error: "Non autorisé." });
    return null;
  }
  return payload;
}

function safeObjectName(originalName) {
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
  if (s.length > 80) s = s.slice(0, 80);
  const ext = lastDot > 0 ? name.slice(lastDot + 1).toLowerCase() : "jpg";
  const map = { jpg: "jpg", jpeg: "jpg", png: "png", gif: "gif", webp: "webp", avif: "avif", bmp: "bmp", svg: "svg" };
  return Date.now() + "-" + s + "." + (map[ext] || "jpg");
}

async function resolveUrl(db, path) {
  const signed = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24);
  if (!signed.error && signed.data && signed.data.signedUrl) return signed.data.signedUrl;
  const pub = db.storage.from(BUCKET).getPublicUrl(path);
  return (pub.data && pub.data.publicUrl) || "";
}

async function ensureMeta(db, name, categoryId) {
  const { data: existing } = await db.from("galerie_photos").select("name").eq("name", name).maybeSingle();
  if (existing) return;
  const { data: maxRow } = await db
    .from("galerie_photos")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow && maxRow.position != null ? maxRow.position : -1) + 1;
  let cat = categoryId || null;
  if (!cat) {
    const { data: firstCat } = await db
      .from("categories")
      .select("id")
      .order("ordre", { ascending: true })
      .limit(1)
      .maybeSingle();
    cat = firstCat ? firstCat.id : null;
  }
  await db.from("galerie_photos").insert([{ name, category_id: cat, position }]);
}

async function syncStorageToMeta(db) {
  const { data: files } = await db.storage.from(BUCKET).list("", { limit: 200 });
  const names = (files || [])
    .filter((f) => f && f.name && f.metadata != null)
    .filter((f) => /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(f.name))
    .map((f) => f.name);
  for (const n of names) {
    await ensureMeta(db, n, null);
  }
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!applyCors(req, res) && req.headers.origin) {
    return json(res, 403, { error: "CORS" });
  }

  const db = getSupabaseAdmin();
  if (!db) {
    return json(res, 503, { error: "Supabase non configuré.", items: [] });
  }

  if (req.method === "GET") {
    await syncStorageToMeta(db);
    const { data: rows, error } = await db
      .from("galerie_photos")
      .select("name, category_id, position, created_at")
      .order("position", { ascending: true });
    if (error) return json(res, 500, { error: error.message, items: [] });

    const { data: cats } = await db.from("categories").select("id, nom, ordre");
    const catMap = {};
    (cats || []).forEach(function (c) {
      catMap[c.id] = c;
    });

    const items = [];
    for (const row of rows || []) {
      const url = await resolveUrl(db, row.name);
      items.push({
        name: row.name,
        url,
        category_id: row.category_id,
        category: row.category_id ? catMap[row.category_id] || null : null,
        position: row.position,
        createdAt: row.created_at,
      });
    }
    return json(res, 200, { items });
  }

  if (!requireAdmin(req, res)) return;

  if (req.method === "POST") {
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return json(res, 400, { error: "JSON invalide." });
    }

    // Réordonner
    if (body.action === "reorder" && Array.isArray(body.order)) {
      for (let i = 0; i < body.order.length; i++) {
        const name = body.order[i];
        if (typeof name !== "string") continue;
        await db.from("galerie_photos").update({ position: i }).eq("name", name);
      }
      return json(res, 200, { ok: true });
    }

    // Changer catégorie
    if (body.action === "setCategory" && body.name) {
      const { error } = await db
        .from("galerie_photos")
        .update({ category_id: body.category_id || null })
        .eq("name", body.name);
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true });
    }

    // Batch set categories / order (save global)
    if (body.action === "saveAll") {
      if (Array.isArray(body.order)) {
        for (let i = 0; i < body.order.length; i++) {
          await db.from("galerie_photos").update({ position: i }).eq("name", body.order[i]);
        }
      }
      if (Array.isArray(body.assignments)) {
        for (const a of body.assignments) {
          if (!a || !a.name) continue;
          await db
            .from("galerie_photos")
            .update({ category_id: a.category_id || null })
            .eq("name", a.name);
        }
      }
      return json(res, 200, { ok: true });
    }

    // Suppression multiple
    if (body.action === "deleteMany" && Array.isArray(body.names)) {
      const names = body.names.filter((n) => typeof n === "string" && n && !n.includes(".."));
      if (names.length) {
        await db.storage.from(BUCKET).remove(names);
        await db.from("galerie_photos").delete().in("name", names);
      }
      return json(res, 200, { ok: true });
    }

    // Upload (base64) — un ou plusieurs
    const files = Array.isArray(body.files) ? body.files : body.data ? [body] : [];
    if (!files.length) return json(res, 400, { error: "Fichier(s) manquant(s)." });

    const uploaded = [];
    for (const f of files) {
      const filename = typeof f.filename === "string" ? f.filename : "image.jpg";
      const contentType = typeof f.contentType === "string" ? f.contentType : "image/jpeg";
      const b64 = typeof f.data === "string" ? f.data.replace(/^data:[^;]+;base64,/, "") : "";
      if (!b64) continue;
      const buffer = Buffer.from(b64, "base64");
      const path = safeObjectName(filename);
      const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
        contentType,
        upsert: false,
        cacheControl: "3600",
      });
      if (error) continue;
      await ensureMeta(db, path, f.category_id || body.category_id || null);
      const url = await resolveUrl(db, path);
      uploaded.push({ name: path, url });
    }
    return json(res, 201, { ok: true, items: uploaded });
  }

  if (req.method === "DELETE") {
    let names = [];
    if (req.query && req.query.name) names = [req.query.name];
    else {
      try {
        const body = await readJsonBody(req);
        if (body && body.name) names = [body.name];
        if (body && Array.isArray(body.names)) names = body.names;
      } catch (e) {
        /* */
      }
    }
    names = names.filter((n) => typeof n === "string" && n && !n.includes(".."));
    if (!names.length) return json(res, 400, { error: "Nom manquant." });
    await db.storage.from(BUCKET).remove(names);
    await db.from("galerie_photos").delete().in("name", names);
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée" });
};
