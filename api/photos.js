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

function isStorageFile(entry) {
  if (!entry || !entry.name) return false;
  // Dossiers Supabase : id null / metadata null, souvent sans extension
  if (entry.id == null && entry.metadata == null) return false;
  if (String(entry.name).endsWith("/")) return false;
  // Placeholders internes
  if (entry.name === ".emptyFolderPlaceholder") return false;
  return true;
}

function looksLikeImage(name, contentType) {
  if (contentType && String(contentType).startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|avif|bmp|svg|heic|heif)$/i.test(name || "");
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
    heic: "heic",
    heif: "heif",
  };
  return Date.now() + "-" + s + "." + (map[ext] || "jpg");
}

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    if (req.body != null) {
      if (Buffer.isBuffer(req.body)) {
        resolve(req.body);
        return;
      }
      if (typeof req.body === "string") {
        resolve(Buffer.from(req.body, "utf8"));
        return;
      }
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
  const boundary = (m[1] || m[2] || "").trim();
  if (!boundary) return null;
  const parts = buffer.toString("binary").split("--" + boundary);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part || part === "--\r\n" || part === "--" || part === "\r\n") continue;
    const sep = part.indexOf("\r\n\r\n");
    if (sep < 0) continue;
    const headers = part.slice(0, sep);
    let body = part.slice(sep + 4);
    if (body.endsWith("\r\n")) body = body.slice(0, -2);
    const nameMatch = /name="([^"]+)"/i.exec(headers);
    const fileMatch = /filename="([^"]*)"/i.exec(headers);
    if (!nameMatch || nameMatch[1] !== "file") continue;
    if (!fileMatch) continue;
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

async function resolveUrl(db, path) {
  const pub = db.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub && pub.data && pub.data.publicUrl ? pub.data.publicUrl : "";

  // URL signée : marche même si le bucket n’est pas public
  const signed = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24);
  if (!signed.error && signed.data && signed.data.signedUrl) {
    return signed.data.signedUrl;
  }
  return publicUrl;
}

async function listGalleryFiles(db) {
  const { data, error } = await db.storage.from(BUCKET).list("", {
    limit: 200,
    offset: 0,
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    // Fallback si created_at non supporté sur certains projets
    const retry = await db.storage.from(BUCKET).list("", {
      limit: 200,
      sortBy: { column: "name", order: "desc" },
    });
    if (retry.error) {
      return { error: error.message || retry.error.message, files: [] };
    }
    return { error: null, files: retry.data || [] };
  }
  return { error: null, files: data || [] };
}

module.exports = async function handler(req, res) {
  const db = getSupabaseAdmin();
  if (!db) {
    return json(res, 503, {
      error: "Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
      items: [],
    });
  }

  if (req.method === "GET") {
    const listed = await listGalleryFiles(db);
    if (listed.error) {
      return json(res, 500, { error: listed.error, items: [] });
    }

    const files = listed.files.filter(isStorageFile).filter(function (f) {
      const ct = f.metadata && (f.metadata.mimetype || f.metadata.contentType);
      if (looksLikeImage(f.name, ct)) return true;
      // Fichier réel avec taille (au cas où l’extension manque)
      if (f.metadata && f.metadata.size != null) return true;
      return false;
    });

    const items = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const url = await resolveUrl(db, f.name);
      items.push({
        name: f.name,
        url: url,
        updatedAt: f.updated_at || f.created_at || null,
      });
    }

    // Tri récent d’abord
    items.sort(function (a, b) {
      return String(b.name).localeCompare(String(a.name));
    });

    return json(res, 200, { items: items });
  }

  if (req.method === "POST") {
    if (!requireAdmin(req, res)) return;

    const ct = String(req.headers["content-type"] || "");
    let filePart = null;

    // 1) JSON base64 (plus fiable sur Vercel Node)
    if (ct.includes("application/json")) {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        return json(res, 400, { error: "JSON invalide." });
      }
      const filename = typeof body.filename === "string" ? body.filename : "image.jpg";
      const contentType =
        typeof body.contentType === "string" ? body.contentType : "application/octet-stream";
      const b64 = typeof body.data === "string" ? body.data : "";
      if (!b64) {
        return json(res, 400, { error: "Données image manquantes (data base64)." });
      }
      const raw = b64.replace(/^data:[^;]+;base64,/, "");
      try {
        filePart = {
          filename: filename,
          type: contentType,
          buffer: Buffer.from(raw, "base64"),
        };
      } catch (e) {
        return json(res, 400, { error: "Base64 invalide." });
      }
    } else if (ct.includes("multipart/form-data")) {
      try {
        const raw = await readRawBody(req);
        filePart = parseMultipart(raw, ct);
      } catch (e) {
        return json(res, 400, { error: "Formulaire invalide." });
      }
    } else {
      return json(res, 415, {
        error: "Content-Type non supporté (JSON base64 ou multipart).",
      });
    }

    if (!filePart || !filePart.buffer || !filePart.buffer.length) {
      return json(res, 400, { error: "Fichier manquant." });
    }

    const path = safeObjectName(filePart.filename);
    const { error } = await db.storage.from(BUCKET).upload(path, filePart.buffer, {
      contentType: filePart.type || "image/jpeg",
      upsert: false,
      cacheControl: "3600",
    });
    if (error) {
      return json(res, 500, { error: error.message });
    }

    const url = await resolveUrl(db, path);
    return json(res, 201, {
      ok: true,
      item: { name: path, url: url },
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

    // Empêcher les chemins bizarres
    name = name.replace(/^\/+/, "");
    if (!name || name.includes("..")) {
      return json(res, 400, { error: "Nom de fichier invalide." });
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
