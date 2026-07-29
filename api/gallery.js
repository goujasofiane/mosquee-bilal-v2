/**
 * Galerie (Vercel Blob) — runtime Node.js (pas Edge).
 *
 * GET  /api/gallery → { items: [...] }
 * POST /api/gallery + header x-mosquee-admin → probe / delete / upload
 */

const { del, list, put } = require("@vercel/blob");

const PREFIX = "mosquee-gallery/";

module.exports.config = {
  runtime: "nodejs",
  api: {
    bodyParser: false,
  },
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function requireAdmin(req) {
  const secret = process.env.MOSQUEE_GALLERY_SECRET || "";
  const sent = req.headers["x-mosquee-admin"] || "";
  if (!secret || sent !== secret) return false;
  return true;
}

function safeObjectName(originalName) {
  const name = originalName || "image";
  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  let ascii = base;
  try {
    ascii = base.normalize("NFD").replace(/\p{M}/gu, "");
  } catch (e) {
    ascii = base;
  }
  let s = ascii
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) s = "image";
  if (s.length > 100) s = s.slice(0, 100).replace(/-+$/g, "") || "image";
  const ext = lastDot > 0 ? name.slice(lastDot + 1).toLowerCase() : "jpg";
  const map = {
    jpg: "jpg",
    jpeg: "jpg",
    png: "png",
    gif: "gif",
    webp: "webp",
    avif: "avif",
    bmp: "bmp",
    svg: "svg",
  };
  const e = map[ext] || "jpg";
  return Date.now() + "-" + s + "." + e;
}

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) return null;
  const boundary = m[1] || m[2];
  const parts = buffer.toString("binary").split("--" + boundary);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || part === "--\r\n" || part === "--") continue;
    const sep = part.indexOf("\r\n\r\n");
    if (sep < 0) continue;
    const headers = part.slice(0, sep);
    let body = part.slice(sep + 4);
    if (body.endsWith("\r\n")) body = body.slice(0, -2);
    const nameMatch = /name="([^"]+)"/i.exec(headers);
    const fileMatch = /filename="([^"]*)"/i.exec(headers);
    if (!nameMatch || nameMatch[1] !== "file" || !fileMatch) continue;
    const filename = fileMatch[1] || "image.jpg";
    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headers);
    const type = typeMatch ? typeMatch[1].trim() : "application/octet-stream";
    const fileBuffer = Buffer.from(body, "binary");
    return { filename: filename, type: type, buffer: fileBuffer };
  }
  return null;
}

module.exports = async function handler(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (req.method === "GET") {
    if (!token) {
      return json(res, 200, {
        items: [],
        warning: "BLOB_READ_WRITE_TOKEN manquant — activez Vercel Blob sur ce projet.",
      });
    }
    try {
      const result = await list({ prefix: PREFIX, token: token });
      const blobs = result.blobs || [];
      const sorted = blobs.slice().sort(function (a, b) {
        return new Date(b.uploadedAt) - new Date(a.uploadedAt);
      });
      return json(res, 200, {
        items: sorted.map(function (b) {
          return {
            url: b.url,
            pathname: b.pathname,
            uploadedAt:
              b.uploadedAt instanceof Date ? b.uploadedAt.toISOString() : b.uploadedAt,
          };
        }),
      });
    } catch (e) {
      return json(res, 200, {
        items: [],
        error: e && e.message ? e.message : "list_failed",
      });
    }
  }

  if (req.method === "POST") {
    if (!requireAdmin(req)) {
      return json(res, 401, {
        error: "Non autorisé — mot de passe incorrect ou secret non configuré sur le serveur.",
      });
    }
    if (!token) {
      return json(res, 503, { error: "Stockage non configuré sur Vercel (Blob)." });
    }

    const ct = String(req.headers["content-type"] || "");

    if (ct.includes("application/json")) {
      let body = {};
      try {
        const raw = await readRawBody(req);
        body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
      } catch (e) {
        return json(res, 400, { error: "JSON invalide" });
      }
      if (body && body.probe === true) {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (body && typeof body.deleteUrl === "string" && body.deleteUrl.indexOf("http") === 0) {
        try {
          await del(body.deleteUrl, { token: token });
          return json(res, 200, { ok: true });
        } catch (e) {
          return json(res, 500, {
            error: e && e.message ? e.message : "delete_failed",
          });
        }
      }
      return json(res, 400, { error: "Action JSON non reconnue (probe ou deleteUrl)." });
    }

    if (ct.includes("multipart/form-data")) {
      let filePart;
      try {
        const raw = await readRawBody(req);
        filePart = parseMultipart(raw, ct);
      } catch (e) {
        return json(res, 400, { error: "Formulaire invalide" });
      }
      if (!filePart) {
        return json(res, 400, { error: "Fichier manquant (champ « file »)." });
      }

      const key = PREFIX + safeObjectName(filePart.filename);
      try {
        const blob = await put(key, filePart.buffer, {
          access: "public",
          token: token,
          addRandomSuffix: false,
          contentType: filePart.type,
        });
        return json(res, 200, { ok: true, url: blob.url, pathname: blob.pathname });
      } catch (e) {
        return json(res, 500, {
          error: e && e.message ? e.message : "upload_failed",
        });
      }
    }

    return json(res, 415, { error: "Content-Type non supporté pour POST." });
  }

  res.statusCode = 405;
  res.end("Method Not Allowed");
};
