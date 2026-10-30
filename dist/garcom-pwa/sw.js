const CACHE='garcom-pwa-shell-v27';
const SHELL=['./','./index.html','./styles.css','./design-tokens.css','./theme-init.js','./icons.svg','./fonts/archivo-latin-wdth-normal.woff2','./fonts/martian-mono-latin-wght-normal.woff2','./brand-mark.webp','./brand-wordmark.webp','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./qrcode-generator.js','./offline.js','./icon.svg','../js/pix.js','../js/realtime.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('garcom-pwa-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
 if(!url.pathname.startsWith('/garcom-pwa/'))return;
 // Network-first: versões atualizadas de HTML/CSS/JS não podem ficar presas no cache.
 e.respondWith(fetch(req).then(res=>{
   if(res.ok){const clone=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(req,clone)));}
   return res;
 }).catch(async()=>{
   const found=await caches.match(req);
   if(found)return found;
   // Nunca responder HTML para CSS/JS: isso remove estilos e quebra as abas.
   if(req.mode==='navigate')return caches.match('./index.html');
   return Response.error();
 }));
});
/*
 * Web Push delivery handlers. The server must send only minimal payloads:
 * { title?, body?, tag?, url? }. The target is constrained to this PWA's
 * same-origin path so a crafted payload cannot turn a notification into an
 * external redirect.
 */
function pushTarget(value) {
  const fallback = new URL('./', self.location.href);
  try {
    const target = new URL(typeof value === 'string' ? value : './', self.location.origin);
    if (target.origin !== self.location.origin || !target.pathname.startsWith('/garcom-pwa/')) {
      return fallback.href;
    }
    return target.href;
  } catch (_) {
    return fallback.href;
  }
}

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    try {
      payload = { body: event.data ? event.data.text() : '' };
    } catch (_) {
      payload = {};
    }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {};

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim().slice(0, 80)
    : 'Atualização de pedido';
  const body = typeof payload.body === 'string' ? payload.body.slice(0, 180) : '';
  const tag = typeof payload.tag === 'string' && payload.tag.trim()
    ? payload.tag.trim().slice(0, 80)
    : 'garcom-update';
  const url = pushTarget(payload.url);

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = pushTarget(event.notification && event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      const current = new URL(client.url);
      if (current.origin !== self.location.origin || !current.pathname.startsWith('/garcom-pwa/')) continue;
      if (typeof client.navigate === 'function') await client.navigate(target);
      await client.focus();
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
