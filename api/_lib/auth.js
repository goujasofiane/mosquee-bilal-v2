const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body != null) {
      if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
        resolve(req.body);
        return;
      }
      if (typeof req.body === "string") {
        try {
          resolve(req.body ? JSON.parse(req.body) : {});
        } catch (e) {
          reject(e);
        }
        return;
      }
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
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
    req.on("error", reject);
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

async function verifyAdminPassword(email, password) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const hash = process.env.ADMIN_PASSWORD || "";
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
};
