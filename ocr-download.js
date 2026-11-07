/* Shared by the recognition worker and offline-package importer. */
(()=>{
  const cacheName='countbean-ocr-v1';
  const base=new URL('./vendor/ocr/',globalThis.location.href);
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  async function verified(bytes,spec){return bytes.byteLength===spec.size&&await digest(bytes)===spec.sha256;}
  async function cached(url,spec){try{const cache=await caches.open(cacheName),r=await cache.match(url);if(r){const b=await r.arrayBuffer();if(await verified(b,spec))return b;await cache.delete(url);}}catch{}return null;}
  async function save(url,bytes,type='application/octet-stream'){try{await (await caches.open(cacheName)).put(url,new Response(bytes,{headers:{'Content-Type':type}}));return true;}catch{return false;}}
  const mime=name=>name.endsWith('.js')||name.endsWith('.mjs')?'text/javascript':name.endsWith('.json')?'application/json':name.endsWith('.wasm')?'application/wasm':'application/octet-stream';
  async function unpack(bytes,spec){
    if(typeof DecompressionStream==='undefined')throw Error('此浏览器不支持压缩资源，请更新 Chrome、Edge 或 Safari。');
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),parts=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>spec.size)throw Error('识别资源长度不正确');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const raw=new Uint8Array(size);let at=0;for(const p of parts){raw.set(p,at);at+=p.length;}
    if(!await verified(raw,spec))throw Error(`${spec.name} 校验失败，请重新下载匹配版本的离线包。`);
    return raw;
  }
  async function fetchPart(url,spec){
    const controller=new AbortController();let idle;
    const reset=()=>{clearTimeout(idle);idle=setTimeout(()=>controller.abort(),30000);};
    const deadline=setTimeout(()=>controller.abort(),180000);reset();
    try{
      // Bypass the service worker cache: it must not hide download progress or cache unverified chunks.
      const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error(`HTTP ${response.status}`);
      const reader=response.body.getReader(),bytes=new Uint8Array(spec.size);let at=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;reset();if(at+value.length>bytes.length)throw Error('资源长度不正确');bytes.set(value,at);at+=value.length;}}finally{await reader.cancel().catch(()=>{});}
      if(at!==spec.size||!await verified(bytes,spec))throw Error('资源校验失败');return bytes;
    }finally{clearTimeout(idle);clearTimeout(deadline);}
  }
  async function load(name,progress=()=>{}){
    const spec=OCR_ASSETS.find(a=>a.name===name);if(!spec)throw Error('未知识别资源');
    const url=new URL(name,base).href,existing=await cached(url,spec);if(existing)return existing;
    const parts=new Array(spec.parts.length);let completed=0,next=0,failure=null;
    const report=()=>progress(`下载 ${name}：${completed}/${parts.length} 块（${Math.round(completed/parts.length*100)}%）。已缓存的分块可复用，可稍后重试。`);
    async function worker(){
      while(next<parts.length&&!failure){
        const i=next++,part=spec.parts[i],partUrl=new URL(part.file,base).href;
        let bytes=await cached(partUrl,part);
        if(!bytes){for(let attempt=0;attempt<3;attempt++){
          try{bytes=await fetchPart(partUrl,part);await save(partUrl,bytes);break;}
          catch(error){if(attempt===2){failure=Error(`${name} 第 ${i+1}/${parts.length} 块下载失败。已成功缓存的分块会复用，点击识别可继续下载；也可以导入离线识别包。${error.message}`);break;}await new Promise(r=>setTimeout(r,300*(attempt+1)));}
        }}
        if(bytes){parts[i]=bytes;completed++;report();}
      }
    }
    report();await Promise.all([worker(),worker()]);if(failure)throw failure;
    const packed=new Uint8Array(spec.packedSize);let at=0;for(const p of parts){packed.set(new Uint8Array(p),at);at+=p.byteLength;}
    const raw=await unpack(packed,spec);await save(url,raw,mime(name));return raw;
  }
  async function importPackage(file,progress=()=>{}){
    const magic=new TextEncoder().encode('COUNTBEAN-OCR-1\n'),size=magic.length+OCR_ASSETS.reduce((n,a)=>n+a.packedSize,0);
    if(file.size!==size||new TextDecoder().decode(await file.slice(0,magic.length).arrayBuffer())!=='COUNTBEAN-OCR-1\n')throw Error('离线包格式或版本不匹配，请使用此版本的 .cbocr 文件。');
    // Validate every asset before writing anything to the cache.
    const decoded=[];let at=magic.length;
    for(const spec of OCR_ASSETS){progress(`正在校验 ${spec.name}…`);decoded.push(await unpack(await file.slice(at,at+spec.packedSize).arrayBuffer(),spec));at+=spec.packedSize;}
    for(let i=0;i<OCR_ASSETS.length;i++){const spec=OCR_ASSETS[i];if(!await save(new URL(spec.name,base).href,decoded[i],mime(spec.name)))throw Error('浏览器存储空间不足或缓存不可用，离线包未能完整保存。');}
    return true;
  }
  globalThis.OCRDownload={load,importPackage};
})();
