// Minimal app-shell service worker.
// Only caches the static files that make up the app itself so it can be
// installed and opens instantly; weather/geocoding API calls always go
// to the network untouched (forecasts should never be served stale).

const CACHE_NAME = "pilsindex-shell-v25";
const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Only handle same-origin app-shell files; let every other request
    // (weather API, geocoding, reverse-geocoding) go straight to the network.
    const isAppShellRequest =
        url.origin === self.location.origin &&
        APP_SHELL.some((path) => url.pathname.endsWith(path.replace("./", "/")) || (path === "./" && url.pathname === "/"));

    if (!isAppShellRequest) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const network = fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});
