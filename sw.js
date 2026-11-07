const CACHE = 'countbean-v6';
const FILES = ['./','./index.html','./styles.css','./recognition.css','./roi.css','./visibility.css','./grid.css','./palette-data.js','./app.js','./recognizer.js','./recognition-flow.js','./ocr-runtime.js','./ocr-worker.js','./manifest.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('countbean-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const saved=await cache.match(event.request);if(saved)return saved;
    const response=await fetch(event.request);
    if(response.ok&&new URL(event.request.url).pathname.includes('/vendor/ocr/'))await cache.put(event.request,response.clone());
    return response;
  }));
});
