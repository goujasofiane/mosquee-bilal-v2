const { readJsonBody, verifyAdminToken, getBearerToken } = require("./_lib/auth");
const { json, preflight } = require("./_lib/http");
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
  if (preflight(req, res)) return;

  const db = getSupabaseAdmin();
  if (!db) return json(res, 503, { error: "Supabase non configuré." });

  if (req.method === "GET") {
    const { data, error } = await db
      .from("categories")
      .select("id, nom, ordre")
      .order("ordre", { ascending: true });
    if (error) return json(res, 500, { error: error.message, items: [] });
    return json(res, 200, { items: data || [] });
  }

  if (!requireAdmin(req, res)) return;

  let body = {};
  try {
    body = await readJsonBody(req, 32 * 1024);
  } catch (e) {
    return json(res, 400, { error: "JSON invalide." });
  }

  if (req.method === "POST") {
    const nom = typeof body.nom === "string" ? body.nom.trim().slice(0, 80) : "";
    if (!nom) return json(res, 400, { error: "Nom requis." });
    const { data: maxRow } = await db
      .from("categories")
      .select("ordre")
      .order("ordre", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ordre = (maxRow && maxRow.ordre != null ? maxRow.ordre : 0) + 1;
    const { data, error } = await db
      .from("categories")
      .insert([{ nom, ordre }])
      .select("id, nom, ordre")
      .single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, { item: data });
  }

  if (req.method === "PUT") {
    const id = body.id;
    if (!id) return json(res, 400, { error: "id requis." });
    const patch = {};
    if (typeof body.nom === "string" && body.nom.trim()) patch.nom = body.nom.trim();
    if (typeof body.ordre === "number") patch.ordre = body.ordre;
    if (!Object.keys(patch).length) return json(res, 400, { error: "Rien à mettre à jour." });
    const { data, error } = await db
      .from("categories")
      .update(patch)
      .eq("id", id)
      .select("id, nom, ordre")
      .single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { item: data });
  }

  if (req.method === "DELETE") {
    const id = body.id || (req.query && req.query.id);
    if (!id) return json(res, 400, { error: "id requis." });
    const { error } = await db.from("categories").delete().eq("id", id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée" });
};
