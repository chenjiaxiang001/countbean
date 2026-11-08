const CACHE = 'countbean-v12';
const FILES = ['./','./index.html','./styles.css','./recognition.css','./roi.css','./visibility.css','./grid.css','./palette-data.js','./app.js','./alignment.js','./recognizer.js','./recognition-flow.js','./ocr-runtime.js','./ocr-worker.js','./ocr-assets.js','./ocr-download.js','./offline-import.js','./manifest.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys(),ocr=await caches.open('countbean-ocr-v1');
  for(const key of keys){
    if(!key.startsWith('countbean-')||key===CACHE||key==='countbean-ocr-v1')continue;
    const old=await caches.open(key);let migrated=true;
    for(const request of await old.keys())if(new URL(request.url).pathname.includes('/vendor/ocr/')){
      try{if(!await ocr.match(request)){const response=await old.match(request);if(response)await ocr.put(request,response);}}catch{migrated=false;}
    }
    if(migrated)await caches.delete(key);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  const pathname=new URL(event.request.url).pathname;
  if(pathname.includes('/vendor/ocr/chunks/')||pathname.endsWith('.cbocr'))return;
  const isOcr=pathname.includes('/vendor/ocr/');
  event.respondWith(caches.open(isOcr?'countbean-ocr-v1':CACHE).then(async cache=>{
    const saved=await cache.match(event.request);if(saved)return saved;
    const response=await fetch(event.request);
    if(response.ok&&isOcr){try{await cache.put(event.request,response.clone());}catch{/* A full cache must not turn a successful download into a fetch error. */}}
    return response;
  }));
});
