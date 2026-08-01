function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store");
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  const envList = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (envList.length) return envList.includes(origin);
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.endsWith(".vercel.app")) return true;
    if (host.includes("mosqueebilal")) return true;
    return false;
  } catch (e) {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin || "";
  if (!origin) return true;
  if (!isOriginAllowed(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
  return true;
}

function json(res, status, body) {
  applySecurityHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function preflight(req, res) {
  applySecurityHeaders(res);
  if (!applyCors(req, res)) {
    res.statusCode = 403;
    res.end();
    return true;
  }
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : "unknown";
}

module.exports = {
  applySecurityHeaders,
  applyCors,
  json,
  preflight,
  clientIp,
};
