const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

/** Taille maximale d'un corps JSON, en octets (base64 compris). */
const MAX_BODY_BYTES = 12 * 1024 * 1024;

class PayloadTooLargeError extends Error {
  constructor() {
    super("payload_too_large");
    this.code = "PAYLOAD_TOO_LARGE";
  }
}

function readJsonBody(req, maxBytes) {
  const limit = maxBytes || MAX_BODY_BYTES;
  return new Promise((resolve, reject) => {
    if (req.body != null) {
      if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
        resolve(req.body);
        return;
      }
      if (typeof req.body === "string") {
        if (Buffer.byteLength(req.body) > limit) {
          reject(new PayloadTooLargeError());
          return;
        }
        try {
          resolve(req.body ? JSON.parse(req.body) : {});
        } catch (e) {
          reject(e);
        }
        return;
      }
    }
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      size += c.length;
      // On coupe dès le dépassement plutôt que de bufferiser tout le corps.
      if (size > limit) {
        aborted = true;
        reject(new PayloadTooLargeError());
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", (e) => {
      if (!aborted) reject(e);
    });
  });
}

function getJwtSecret() {
  return process.env.JWT_SECRET || "";
}

function signAdminToken(email) {
  const secret = getJwtSecret();
  if (!secret) throw new Error("JWT_SECRET manquant");
  return jwt.sign({ role: "admin", email }, secret, { expiresIn: "2h" });
}

function verifyAdminToken(token) {
  const secret = getJwtSecret();
  if (!secret || !token) return null;
  try {
    const payload = jwt.verify(token, secret);
    if (!payload || payload.role !== "admin") return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function getBearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  if (typeof h === "string" && h.toLowerCase().startsWith("bearer ")) {
    return h.slice(7).trim();
  }
  return "";
}

/**
 * Vérifie que la configuration admin est exploitable.
 * Permet de distinguer « mauvais mot de passe » de « variable d'environnement
 * absente ou mal collée » sans jamais révéler la moindre valeur.
 */
function adminConfigStatus() {
  const email = (process.env.ADMIN_EMAIL || "").trim();
  const hash = (process.env.ADMIN_PASSWORD || "").trim();
  if (!email) return "missing_email";
  if (!hash) return "missing_password";
  // Un hash bcrypt commence toujours par $2a$, $2b$ ou $2y$ et fait 59-60 caractères.
  if (!/^\$2[aby]\$\d{2}\$.{53}$/.test(hash)) return "not_a_bcrypt_hash";
  if (!process.env.JWT_SECRET) return "missing_jwt_secret";
  return "ok";
}

async function verifyAdminPassword(email, password) {
  // .trim() est indispensable : un retour à la ligne collé par erreur dans le
  // panneau Vercel suffirait sinon à faire échouer bcrypt.compare() en silence.
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const hash = (process.env.ADMIN_PASSWORD || "").trim();
  if (!adminEmail || !hash) return false;
  if ((email || "").trim().toLowerCase() !== adminEmail) return false;
  try {
    return await bcrypt.compare(password || "", hash);
  } catch (e) {
    return false;
  }
}

module.exports = {
  readJsonBody,
  signAdminToken,
  verifyAdminToken,
  getBearerToken,
  verifyAdminPassword,
  adminConfigStatus,
  PayloadTooLargeError,
  MAX_BODY_BYTES,
};
