const CACHE='garcom-pwa-shell-v10';
const SHELL=['./','./index.html','./styles.css','./app.js','./qrcode.min.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
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