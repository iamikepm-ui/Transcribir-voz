// PerezApp: guarda la app en el móvil para poder abrirla y usarla sin cobertura.
// - Páginas y archivos de la app: primero la red (para tener siempre la última versión) y, si no hay o tarda más de 2,5 s, la copia guardada.
// - Librerías de jsdelivr (motor de IA, versión fija): primero la copia guardada.
// - Los modelos de Hugging Face los guarda el propio motor de IA (Transformers.js) en su caché.
const SHELL = 'pz-shell-v4', CDN = 'pz-cdn-v1';
const FILES = ['./', 'index.html', 'i18n.js', 'licencia.js', 'format.js', 'worker.js', 'logo.svg', 'manifest.webmanifest',
  'pz-icon-192.png', 'pz-icon-512.png', 'pz-icon-maskable.png', 'pz-apple-touch-icon.png', 'privacidad.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pz-') && k !== SHELL && k !== CDN).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms));

async function networkFirst(e) {
  // sin cobertura (o muy poca, en carretera) no se espera a la red más de 2,5 s: se abre la copia guardada
  // y la descarga sigue en segundo plano para que la próxima vez esté al día
  const req = e.request, cache = await caches.open(SHELL);
  if (new URL(req.url).searchParams.has('v')) { const same = await cache.match(req); if (same) return same; }   // «archivo.js?v=…»: esa versión no cambia nunca
  const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()).catch(() => {}); return res; });
  e.waitUntil(net.then(() => {}, () => {}));
  try { return await Promise.race([net, timeout(2500)]); }
  catch {
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match('./', { ignoreSearch: true }));
    if (hit) return hit;
    try { return await net; } catch { return Response.error(); }
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
    e.respondWith(networkFirst(e));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(cacheFirst(req));
  }
});
