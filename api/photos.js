const {
  json,
  readJsonBody,
  verifyAdminToken,
  getBearerToken,
} = require("./_lib/auth");
const { getSupabaseAdmin } = require("./_lib/supabase");

const BUCKET = "galerie";

function requireAdmin(req, res) {
  const payload = verifyAdminToken(getBearerToken(req));
  if (!payload) {
    json(res, 401, { error: "Non autorisé." });
    return null;
  }
  return payload;
}

function isImageName(name) {
  return /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(name || "");
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
  return Date.now() + "-" + s + "." + (map[ext] || "jpg");
}

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    if (req.body != null && Buffer.isBuffer(req.body)) {
      resolve(req.body);
      return;
    }
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
    return {
      filename: filename,
      type: type,
      buffer: Buffer.from(body, "binary"),
    };
  }
  return null;
}

function publicUrl(db, path) {
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return data && data.publicUrl ? data.publicUrl : "";
}

module.exports = async function handler(req, res) {
  const db = getSupabaseAdmin();
  if (!db) {
    return json(res, 503, { error: "Supabase non configuré sur le serveur." });
  }

  if (req.method === "GET") {
    const { data, error } = await db.storage.from(BUCKET).list("", {
      limit: 200,
      sortBy: { column: "name", order: "desc" },
    });
    if (error) {
      return json(res, 500, { error: error.message, items: [] });
    }
    const items = (data || [])
      .filter(function (f) {
        return f.name && !(f.id && String(f.id).endsWith("/")) && isImageName(f.name);
      })
      .map(function (f) {
        return {
          name: f.name,
          url: publicUrl(db, f.name),
          updatedAt: f.updated_at || f.created_at || null,
        };
      });
    return json(res, 200, { items: items });
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;

    const ct = String(req.headers["content-type"] || "");
    if (!ct.includes("multipart/form-data")) {
      return json(res, 415, { error: "Envoyez un fichier (multipart/form-data, champ file)." });
    }

    let filePart;
    try {
      const raw = await readRawBody(req);
      filePart = parseMultipart(raw, ct);
    } catch (e) {
      return json(res, 400, { error: "Formulaire invalide." });
    }
    if (!filePart || !filePart.buffer || !filePart.buffer.length) {
      return json(res, 400, { error: "Fichier manquant (champ « file »)." });
    }

    const path = safeObjectName(filePart.filename);
    const { error } = await db.storage.from(BUCKET).upload(path, filePart.buffer, {
      contentType: filePart.type || "application/octet-stream",
      upsert: false,
      cacheControl: "3600",
    });
    if (error) {
      return json(res, 500, { error: error.message });
    }
    return json(res, 201, {
      ok: true,
      item: { name: path, url: publicUrl(db, path) },
    });
  }

  if (req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;

    let name = req.query && req.query.name;
    if (!name) {
      try {
        const body = await readJsonBody(req);
        name = body && body.name;
      } catch (e) {
        name = null;
      }
    }
    if (!name || typeof name !== "string") {
      return json(res, 400, { error: "Nom de fichier manquant." });
    }

    const { error } = await db.storage.from(BUCKET).remove([name]);
    if (error) {
      return json(res, 500, { error: error.message });
    }
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "Méthode non autorisée" });
};

module.exports.config = {
  runtime: "nodejs",
  api: { bodyParser: false },
};
