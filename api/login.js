/**
 * Authentification admin.
 * POST { email, password } -> { token, expiresIn }
 *
 * Limitation : 5 échecs par IP par heure. Le compteur repart de zéro dès
 * qu'une connexion réussit.
 */

const {
  readJsonBody,
  signAdminToken,
  verifyAdminPassword,
  adminConfigStatus,
  PayloadTooLargeError,
} = require("./_lib/auth");
const { json, preflight, clientIp } = require("./_lib/http");
const { getSupabaseAdmin } = require("./_lib/supabase");

const GENERIC = "Identifiants incorrects.";
const THROTTLED = "Trop de tentatives. Réessayez dans une heure.";
const MISCONFIGURED =
  "Connexion indisponible : configuration serveur incomplète. Contactez l'administrateur.";
const MAX_FAILS = 5;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Compte les échecs survenus depuis la dernière connexion réussie, dans la
 * fenêtre glissante. Compter depuis le dernier succès évite qu'un admin
 * légitime reste banni une heure après avoir retrouvé son mot de passe.
 */
async function countRecentFails(db, ip) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data, error } = await db
    .from("admin_logs")
    .select("id, success, date")
    .eq("ip", ip)
    .gte("date", since)
    .order("date", { ascending: false })
    .limit(50);
  if (error) return { fails: 0, blocked: false };

  let fails = 0;
  for (const row of data || []) {
    if (row.success === true) break; // succès plus récent : on s'arrête là
    fails++;
  }
  return { fails, blocked: fails >= MAX_FAILS };
}

async function logAttempt(db, ip, success) {
  if (!db) return;
  try {
    await db.from("admin_logs").insert([{ ip, success: !!success }]);
  } catch (e) {
    /* la journalisation ne doit jamais faire échouer la connexion */
  }
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Méthode non autorisée." });
  }

  // Une configuration incomplète produisait auparavant un « Identifiants
  // incorrects » indiscernable d'un vrai mauvais mot de passe.
  const config = adminConfigStatus();
  if (config !== "ok") {
    return json(res, 503, { error: MISCONFIGURED, reason: config });
  }

  const db = getSupabaseAdmin();
  const ip = clientIp(req);

  if (db) {
    const rate = await countRecentFails(db, ip);
    if (rate.blocked) {
      // On n'enregistre PAS cette tentative : sinon le blocage s'auto-entretient.
      res.setHeader("Retry-After", String(Math.ceil(WINDOW_MS / 1000)));
      return json(res, 429, { error: THROTTLED });
    }
  }

  let body;
  try {
    body = await readJsonBody(req, 8 * 1024);
  } catch (e) {
    if (e instanceof PayloadTooLargeError) {
      return json(res, 413, { error: "Requête trop volumineuse." });
    }
    return json(res, 400, { error: GENERIC });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  const ok = await verifyAdminPassword(email, password);
  if (!ok) {
    await logAttempt(db, ip, false);
    return json(res, 401, { error: GENERIC });
  }

  try {
    const token = signAdminToken(email.trim().toLowerCase());
    await logAttempt(db, ip, true);
    return json(res, 200, { token, expiresIn: 7200 });
  } catch (e) {
    return json(res, 500, { error: MISCONFIGURED });
  }
};
