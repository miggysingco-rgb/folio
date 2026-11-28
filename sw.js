/* Folio offline: keeps the app page on the device so it opens with no internet.
   Your notes, PDFs and study apps are not here: they live in the app's own storage on each device.
   Every address is relative to this file, so the site works at any address or sub-folder. */
const VERSION = 'folio-shell 2026-11-28 22:50 card-drag';
const BASE = new URL('./', self.location).pathname;
const APP = BASE + 'index.html';
const SHELL = [APP, BASE + 'manifest.json', BASE + 'icon-192.png', BASE + 'icon-512.png'];

/* only keep a real copy: never a sign-in page, a redirect or an error */
async function good(key, r) {
  if (!r || !r.ok || r.redirected) return false;
  if (key !== APP) return true;
  try { return (await r.clone().text()).includes('__FOLIBS'); } catch (_) { return false; }
}
async function tell(msg) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const w of all) w.postMessage(msg);
}
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(SHELL.map(async u => {
      try { const r = await fetch(u, { cache: 'reload' }); if (await good(u, r)) await c.put(u, r); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter(k => k.startsWith('folio-shell ') && k !== VERSION);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    if (old.length) tell({ type: 'folio-update', version: VERSION });
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const key = url.pathname === BASE || url.pathname === BASE.slice(0, -1) ? APP : url.pathname;
  if (!SHELL.includes(key)) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const fresh = fetch(key, { cache: 'no-cache' }).then(async r => { if (await good(key, r)) await c.put(key, r.clone()); return r; });
    /* the app page: open the copy saved on this device right away (no waiting on the internet), and fetch the newest
       version in the background. When it differs, the open page offers "New version ready · Tap to reload". */
    if (key === APP) {
      const hit = await c.match(key);
      if (hit) {
        e.waitUntil(fresh.then(r => {
          const a = hit.headers.get('etag'), b = r && r.headers.get('etag'), la = hit.headers.get('last-modified'), lb = r && r.headers.get('last-modified');
          if (r && r.ok && ((a && b && a !== b) || (!(a && b) && la && lb && la !== lb))) tell({ type: 'folio-update' });
        }).catch(() => {}));
        return hit;
      }
      try { return await fresh; } catch (_) { return new Response('Folio is not saved on this device yet. Open it once with internet.', { status: 503, headers: { 'content-type': 'text/plain' } }); }
    }
    const hit = await c.match(key);
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    try { return await fresh; } catch (_) { return new Response('Folio is not saved on this device yet. Open it once with internet.', { status: 503, headers: { 'content-type': 'text/plain' } }); }
  })());
});
