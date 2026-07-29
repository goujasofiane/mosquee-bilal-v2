const {
  json,
  readJsonBody,
  signAdminToken,
  verifyAdminPassword,
} = require("./_lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Méthode non autorisée" });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return json(res, 400, { error: "Identifiants incorrects." });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  const ok = await verifyAdminPassword(email, password);
  if (!ok) {
    return json(res, 401, { error: "Identifiants incorrects." });
  }

  try {
    const token = signAdminToken(email.trim().toLowerCase());
    return json(res, 200, { token });
  } catch (e) {
    return json(res, 500, { error: "Configuration serveur incomplete (JWT)." });
  }
};
