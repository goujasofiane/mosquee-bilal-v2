/**
 * Utilitaires HTTP partagés par toutes les fonctions serverless.
 * Headers de sécurité, contrôle d'origine (CORS), réponses JSON, IP client.
 */

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store");
}

/** Hôte réellement servi par Vercel (derrière le proxy, Host est réécrit). */
function requestHost(req) {
  const forwarded = req.headers["x-forwarded-host"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim().toLowerCase();
  }
  const host = req.headers.host;
  return typeof host === "string" ? host.trim().toLowerCase() : "";
}

/**
 * Une origine est acceptée si :
 *  - elle est identique à l'hôte de la requête (same-origin : le cas normal du site) ;
 *  - elle figure dans ALLOWED_ORIGINS ;
 *  - c'est un environnement de développement local ou une preview Vercel.
 *
 * Le same-origin doit passer en premier : le navigateur envoie un en-tête Origin
 * même sur un POST fetch vers sa propre origine. Sans ce cas, un domaine
 * personnalisé faisait échouer /api/login avec un 403 déguisé en
 * « Identifiants incorrects. »
 */
function isOriginAllowed(req, origin) {
  if (!origin) return true;

  let url;
  try {
    url = new URL(origin);
  } catch (e) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const originHost = url.host.toLowerCase(); // inclut le port éventuel

  // 1. Same-origin — toujours autorisé.
  const self = requestHost(req);
  if (self && (originHost === self || host === self.split(":")[0])) return true;

  // 2. Liste blanche explicite (recommandé en production).
  const envList = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (envList.length && envList.includes(origin)) return true;

  // 3. Développement local et previews Vercel.
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".vercel.app")) return true;

  return false;
}

function applyCors(req, res) {
  const origin = req.headers.origin || "";
  if (!origin) return true;
  if (!isOriginAllowed(req, origin)) return false;
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

/**
 * Gère le préflight et le refus d'origine.
 * Retourne true si la réponse a déjà été envoyée et que le handler doit s'arrêter.
 */
function preflight(req, res) {
  applySecurityHeaders(res);
  if (!applyCors(req, res)) {
    json(res, 403, { error: "Origine non autorisée." });
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
  isOriginAllowed,
  json,
  preflight,
  clientIp,
};
