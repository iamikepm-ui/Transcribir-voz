// PerezApp: guarda la app en el móvil para poder abrirla y usarla sin cobertura.
// - Páginas y archivos de la app: primero la red (para tener siempre la última versión) y, si no hay o tarda, la copia guardada.
// - Librerías de jsdelivr (motor de IA, versión fija): primero la copia guardada.
// - Los modelos de Hugging Face los guarda el propio motor de IA (Transformers.js) en su caché.
const SHELL = 'pz-shell-v1', CDN = 'pz-cdn-v1';
const FILES = ['./', 'index.html', 'i18n.js', 'licencia.js', 'format.js', 'worker.js', 'logo.svg', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable.png', 'apple-touch-icon.png', 'privacidad.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pz-') && k !== SHELL && k !== CDN).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms));

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(req), timeout(5000)]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match('./', { ignoreSearch: true }));
    return hit || Response.error();
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(CDN);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (!url.pathname.startsWith(new URL('./', location).pathname)) return;
    if (url.pathname.includes('/generador/')) return;          // el generador va siempre por la red
    if (url.searchParams.has('check')) return;                  // comprobaciones del generador
    e.respondWith(networkFirst(req));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(cacheFirst(req));
  }
});
