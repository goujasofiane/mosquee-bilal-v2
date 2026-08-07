/**
 * Service worker — Mosquée Bilal.
 *
 * Strategies :
 *  - navigation  : reseau d'abord, cache en secours (page hors-ligne si besoin) ;
 *  - styles/js   : cache d'abord, revalidation en arriere-plan ;
 *  - images      : cache d'abord, plafonne pour ne pas saturer le stockage ;
 *  - /api/       : jamais mis en cache, les annonces et photos doivent etre fraiches.
 *
 * Changer VERSION invalide tous les anciens caches au prochain chargement.
 */

const VERSION = "mb-v1";
const SHELL_CACHE = VERSION + "-shell";
const PAGE_CACHE = VERSION + "-pages";
const IMG_CACHE = VERSION + "-images";
const MAX_IMAGES = 60;

/** Ressources indispensables au premier rendu hors ligne. */
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/offline.html",
  "/assets/logo1.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll echouerait en bloc si une seule ressource manquait.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/** Supprime les entrees les plus anciennes au-dela de la limite. */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (let i = 0; i < keys.length - maxEntries; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Uniquement notre propre origine : pas de mise en cache des tiers.
  if (url.origin !== self.location.origin) return;

  // Les donnees dynamiques et l'administration ne sont jamais mises en cache.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;

  // Navigation : reseau d'abord pour toujours afficher la derniere version.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || caches.match("/offline.html");
        })
    );
    return;
  }

  const dest = req.destination;

  if (dest === "style" || dest === "script" || dest === "font") {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (dest === "image") {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req)
            .then((res) => {
              const copy = res.clone();
              caches.open(IMG_CACHE).then((c) => {
                c.put(req, copy);
                trimCache(IMG_CACHE, MAX_IMAGES);
              });
              return res;
            })
            .catch(() => cached)
      )
    );
  }
});
