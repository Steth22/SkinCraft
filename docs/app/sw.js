// Network-first so updates show up right away; the cache only serves the app when offline.
const CACHE = 'skincraft-v1';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icon.png', 'icon-192.png', 'icon-512.png',
  'js/main.js', 'js/world.js', 'js/library.js', 'js/editor.js', 'js/model.js', 'js/skin.js', 'js/ui.js',
  'js/icons.js', 'js/bridge.js', 'js/colorpicker.js', 'js/three.module.min.js',
  'fonts/monocraft.ttf', 'fonts/monocraft-bold.ttf', 'fonts/monocraft-black.ttf',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
