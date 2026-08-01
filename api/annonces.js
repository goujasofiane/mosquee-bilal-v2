const { readJsonBody, verifyAdminToken, getBearerToken } = require("./_lib/auth");
const { json, preflight, applyCors } = require("./_lib/http");
const { getSupabaseAdmin } = require("./_lib/supabase");

const FILES_BUCKET = "annonces-fichiers";

function requireAdmin(req, res) {
  const payload = verifyAdminToken(getBearerToken(req));
  if (!payload) {
    json(res, 401, { error: "Non autorisé." });
    return null;
  }
  return payload;
}

function safeName(originalName) {
  const name = originalName || "fichier";
  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  let ascii = base;
  try {
    ascii = base.normalize("NFD").replace(/\p{M}/gu, "");
  } catch (e) {
    ascii = base;
  }
  let s = ascii.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
  if (!s) s = "fichier";
  const ext = lastDot > 0 ? name.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
  return Date.now() + "-" + s.slice(0, 80) + "." + (ext || "bin");
}

async function fileUrl(db, path) {
  const signed = await db.storage.from(FILES_BUCKET).createSignedUrl(path, 60 * 60 * 24);
  if (!signed.error && signed.data && signed.data.signedUrl) return signed.data.signedUrl;
  const pub = db.storage.from(FILES_BUCKET).getPublicUrl(path);
  return (pub.data && pub.data.publicUrl) || "";
}

async function attachFiles(db, annonceId, includeUrls) {
  const { data } = await db
    .from("annonce_fichiers")
    .select("id, path, nom_original")
    .eq("annonce_id", annonceId);
  const list = data || [];
  if (!includeUrls) {
    return list.map((f) => ({ id: f.id, nom_original: f.nom_original, path: f.path }));
  }
  const out = [];
  for (const f of list) {
    out.push({
      id: f.id,
      nom_original: f.nom_original,
      path: f.path,
      url: await fileUrl(db, f.path),
    });
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!applyCors(req, res) && req.headers.origin) {
    return json(res, 403, { error: "CORS" });
  }

  const db = getSupabaseAdmin();
  if (!db) return json(res, 503, { error: "Supabase non configuré." });

  if (req.method === "GET") {
    const limitRaw = Number(req.query && req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 100;
    const withFiles = String((req.query && req.query.files) || "") === "1";

    const { data, error } = await db
      .from("annonces")
      .select("id, titre, texte, date, police, couleur")
      .order("date", { ascending: false })
      .limit(limit);

    if (error) return json(res, 500, { error: error.message });

    const items = [];
    for (const row of data || []) {
      const item = {
        id: row.id,
        titre: row.titre,
        texte: row.texte,
        date: row.date,
        police: row.police || "Cairo",
        couleur: row.couleur || "#f5f0e1",
      };
      if (withFiles) {
        item.fichiers = await attachFiles(db, row.id, true);
      }
      items.push(item);
    }
    return json(res, 200, { items });
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;
    let body;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return json(res, 400, { error: "Requête invalide." });
    }

    if (body && body.action === "verify") {
      return json(res, 200, { ok: true });
    }

    const titre = typeof body.titre === "string" ? body.titre.trim() : "";
    const texte = typeof body.texte === "string" ? body.texte.trim() : "";
    if (!titre || !texte) return json(res, 400, { error: "Titre et texte requis." });

    const police = typeof body.police === "string" ? body.police : "Cairo";
    const couleur = typeof body.couleur === "string" ? body.couleur : "#f5f0e1";

    const { data, error } = await db
      .from("annonces")
      .insert([{ titre, texte, police, couleur }])
      .select("id, titre, texte, date, police, couleur")
      .single();
    if (error) return json(res, 500, { error: error.message });

    const fichiersIn = Array.isArray(body.fichiers) ? body.fichiers : [];
    for (const f of fichiersIn) {
      const raw = typeof f.data === "string" ? f.data.replace(/^data:[^;]+;base64,/, "") : "";
      if (!raw) continue;
      const path = safeName(f.filename || "fichier");
      const buffer = Buffer.from(raw, "base64");
      const { error: upErr } = await db.storage.from(FILES_BUCKET).upload(path, buffer, {
        contentType: f.contentType || "application/octet-stream",
        upsert: false,
      });
      if (upErr) continue;
      await db.from("annonce_fichiers").insert([
        {
          annonce_id: data.id,
          path,
          nom_original: f.filename || path,
        },
      ]);
    }

    const fichiers = await attachFiles(db, data.id, true);
    return json(res, 201, { item: Object.assign({}, data, { fichiers }) });
  }

  if (req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;
    let id = req.query && req.query.id;
    if (!id) {
      try {
        const body = await readJsonBody(req);
        id = body && body.id;
      } catch (e) {
        id = null;
      }
    }
    if (!id || typeof id !== "string") return json(res, 400, { error: "Identifiant manquant." });

    const { data: files } = await db.from("annonce_fichiers").select("path").eq("annonce_id", id);
    const paths = (files || []).map((f) => f.path).filter(Boolean);
    if (paths.length) await db.storage.from(FILES_BUCKET).remove(paths);

    const { error } = await db.from("annonces").delete().eq("id", id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée" });
};
