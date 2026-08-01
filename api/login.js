const { readJsonBody, signAdminToken, verifyAdminPassword } = require("./_lib/auth");
const { json, preflight, clientIp } = require("./_lib/http");
const { getSupabaseAdmin } = require("./_lib/supabase");

const GENERIC = "Identifiants incorrects.";
const MAX_FAILS = 5;
const WINDOW_MS = 60 * 60 * 1000;

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
  const fails = (data || []).filter((r) => r.success === false).length;
  return { fails, blocked: fails >= MAX_FAILS };
}

async function logAttempt(db, ip, success) {
  if (!db) return;
  try {
    await db.from("admin_logs").insert([{ ip, success: !!success }]);
  } catch (e) {
    /* ignore */
  }
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (!require("./_lib/http").applyCors(req, res) && req.headers.origin) {
    return json(res, 403, { error: GENERIC });
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: GENERIC });
  }

  const db = getSupabaseAdmin();
  const ip = clientIp(req);

  if (db) {
    const rate = await countRecentFails(db, ip);
    if (rate.blocked) {
      await logAttempt(db, ip, false);
      return json(res, 429, { error: GENERIC });
    }
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (db) await logAttempt(db, ip, false);
    return json(res, 400, { error: GENERIC });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  const ok = await verifyAdminPassword(email, password);
  if (!ok) {
    if (db) await logAttempt(db, ip, false);
    return json(res, 401, { error: GENERIC });
  }

  try {
    const token = signAdminToken(email.trim().toLowerCase());
    if (db) await logAttempt(db, ip, true);
    return json(res, 200, { token, expiresIn: 7200 });
  } catch (e) {
    return json(res, 500, { error: GENERIC });
  }
};
