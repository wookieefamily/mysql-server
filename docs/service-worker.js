/* 28-Day Indoor Walking — offline service worker */
const CACHE = "walk28-v5";
const ASSET_VER = "5";   // keep in sync with ASSET_VER in index.html
const MOVES = ["march","steptouch","heeldig","kneelift","grapevine","lunge","squat",
  "wallpushup","glutebridge","calfraise","birddog","deadbug","plank","wallsit",
  "legraise","oblique","superman","punches","stretch","rest"];
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.png",
  ...MOVES.map((m) => `./gifs/${m}.gif?v=${ASSET_VER}`)
];

// Pre-cache the app shell on install.
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  // Note: we do NOT skipWaiting here — the new worker waits so the page can
  // show an "Update" prompt and activate it only when the user taps it.
});

// Page asks us to activate immediately (user tapped "Update").
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

// Drop old caches on activate.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first, fall back to network; update cache in the background.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
