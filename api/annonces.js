const {
  json,
  readJsonBody,
  verifyAdminToken,
  getBearerToken,
} = require("./_lib/auth");
const { getSupabaseAdmin } = require("./_lib/supabase");

function requireAdmin(req, res) {
  const payload = verifyAdminToken(getBearerToken(req));
  if (!payload) {
    json(res, 401, { error: "Non autorisé." });
    return null;
  }
  return payload;
}

module.exports = async function handler(req, res) {
  const db = getSupabaseAdmin();
  if (!db) {
    return json(res, 503, { error: "Supabase non configuré sur le serveur." });
  }

  if (req.method === "GET") {
    const limitRaw = Number(req.query && req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 100;

    const { data, error } = await db
      .from("annonces")
      .select("id, titre, texte, date")
      .order("date", { ascending: false })
      .limit(limit);

    if (error) {
      return json(res, 500, { error: error.message });
    }
    return json(res, 200, { items: data || [] });
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
    if (!titre || !texte) {
      return json(res, 400, { error: "Titre et texte requis." });
    }

    const { data, error } = await db
      .from("annonces")
      .insert([{ titre, texte }])
      .select("id, titre, texte, date")
      .single();

    if (error) {
      return json(res, 500, { error: error.message });
    }
    return json(res, 201, { item: data });
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
    if (!id || typeof id !== "string") {
      return json(res, 400, { error: "Identifiant manquant." });
    }

    const { error } = await db.from("annonces").delete().eq("id", id);
    if (error) {
      return json(res, 500, { error: error.message });
    }
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée" });
};
