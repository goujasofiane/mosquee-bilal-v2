/**
 * Galerie sans Supabase : Vercel Blob + cette route.
 *
 * Sur Vercel : activer Blob (Storage) sur le projet pour injecter BLOB_READ_WRITE_TOKEN.
 * Variables à ajouter manuellement :
 *   MOSQUEE_GALLERY_SECRET = un mot de passe long (même valeur que saisi sur /admin)
 *
 * GET /api/gallery → { items: [{ url, pathname, uploadedAt }] } (public)
 * POST /api/gallery (JSON {probe:true}) + header x-mosquee-admin → vérif mot de passe
 * POST /api/gallery (multipart file=…) + header x-mosquee-admin → upload
 * POST /api/gallery (JSON {deleteUrl}) + header x-mosquee-admin → suppression
 */

import { del, list, put } from "@vercel/blob";

const PREFIX = "mosquee-gallery/";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function requireAdmin(request) {
  const secret = process.env.MOSQUEE_GALLERY_SECRET || "";
  const sent = request.headers.get("x-mosquee-admin") || "";
  if (!secret || sent !== secret) {
    return false;
  }
  return true;
}

function safeObjectName(originalName) {
  const name = originalName || "image";
  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  let ascii = base;
  try {
    ascii = base.normalize("NFD").replace(/\p{M}/gu, "");
  } catch {
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
  const map = { jpg: "jpg", jpeg: "jpg", png: "png", gif: "gif", webp: "webp", avif: "avif", bmp: "bmp", svg: "svg" };
  const e = map[ext] || "jpg";
  return `${Date.now()}-${s}.${e}`;
}

export const config = { runtime: "edge" };

export default async function handler(request) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (request.method === "GET") {
    if (!token) {
      return json({ items: [], warning: "BLOB_READ_WRITE_TOKEN manquant — activez Vercel Blob sur ce projet." });
    }
    try {
      const { blobs } = await list({ prefix: PREFIX, token });
      const sorted = [...blobs].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      return json({
        items: sorted.map((b) => ({
          url: b.url,
          pathname: b.pathname,
          uploadedAt: b.uploadedAt instanceof Date ? b.uploadedAt.toISOString() : b.uploadedAt,
        })),
      });
    } catch (e) {
      return json({ items: [], error: e instanceof Error ? e.message : "list_failed" }, 200);
    }
  }

  if (request.method === "POST") {
    if (!requireAdmin(request)) {
      return json({ error: "Non autorisé — mot de passe incorrect ou secret non configuré sur le serveur." }, 401);
    }
    if (!token) {
      return json({ error: "Stockage non configuré sur Vercel (Blob)." }, 503);
    }

    const ct = request.headers.get("content-type") || "";

    if (ct.includes("application/json")) {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "JSON invalide" }, 400);
      }
      if (body && body.probe === true) {
        return new Response(null, { status: 204 });
      }
      if (body && typeof body.deleteUrl === "string" && body.deleteUrl.startsWith("http")) {
        try {
          await del(body.deleteUrl, { token });
          return json({ ok: true });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "delete_failed" }, 500);
        }
      }
      return json({ error: "Action JSON non reconnue (probe ou deleteUrl)." }, 400);
    }

    if (ct.includes("multipart/form-data")) {
      let formData;
      try {
        formData = await request.formData();
      } catch {
        return json({ error: "Formulaire invalide" }, 400);
      }
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return json({ error: "Fichier manquant (champ « file »)." }, 400);
      }

      const origName = typeof file.name === "string" ? file.name : "image";
      const key = PREFIX + safeObjectName(origName);

      try {
        const blob = await put(key, file, {
          access: "public",
          token,
          addRandomSuffix: false,
        });
        return json({ ok: true, url: blob.url, pathname: blob.pathname });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "upload_failed" }, 500);
      }
    }

    return json({ error: "Content-Type non supporté pour POST." }, 415);
  }

  return new Response("Method Not Allowed", { status: 405 });
}
