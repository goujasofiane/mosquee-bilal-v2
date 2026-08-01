const { verifyAdminToken, getBearerToken, signAdminToken } = require("./_lib/auth");
const { json, preflight, applyCors } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!applyCors(req, res) && req.headers.origin) {
    return json(res, 403, { error: "CORS" });
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Méthode non autorisée" });
  }

  const payload = verifyAdminToken(getBearerToken(req));
  if (!payload) {
    return json(res, 401, { error: "Non autorisé." });
  }

  try {
    const token = signAdminToken(payload.email || "admin");
    return json(res, 200, { token, expiresIn: 7200 });
  } catch (e) {
    return json(res, 500, { error: "JWT non configuré." });
  }
};
