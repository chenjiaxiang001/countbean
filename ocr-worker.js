let ready;
async function loadAsset(path,label){
  const url=new URL(path,self.location.href).href;
  let cache;try{cache=await caches.open('countbean-ocr-v1');const saved=await cache.match(url);if(saved)return saved;}catch{}
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      // Finish downloading before caching/returning: interrupted response bodies also retry.
      const body=await response.arrayBuffer(),complete=new Response(body,{headers:response.headers,status:response.status});
      try{await cache?.put(url,complete.clone());}catch{}
      return complete;
    }catch(error){
      if(attempt===2)throw Error(`${label}加载失败（${path.split('/').pop()}）：${error.message}。首次识别需要联网下载约 22 MB，请检查网络后重试；完整缓存后才可离线识别。`);
      await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
    }
  }
}
async function initialize(){
  try{importScripts('./vendor/ocr/ort.wasm.min.js','./ocr-runtime.js');}
  catch(error){throw Error('OCR 脚本加载失败，请检查网络后重新点击识别。'+error.message);}
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=new URL('./vendor/ocr/',self.location.href).href;
  const response=await loadAsset('./vendor/ocr/ppocr-v4-rec.onnx','识别模型');
  if(!response.ok)throw Error('识别模型下载失败，请检查网络后重试。');
  const model=await response.arrayBuffer();
  const dictResponse=await loadAsset('./vendor/ocr/characters.json','识别字典');
  if(!dictResponse.ok)throw Error('识别字典下载失败。');
  const characters=await dictResponse.json();
  let session;
  try{session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});}
  catch(error){throw Error('OCR 运行库初始化失败（WASM/MJS）。首次使用请保持联网，稍后重试。'+error.message);}
  return new ChartTextReader(ort,session,characters);
}
self.onmessage=async({data})=>{
  try{ready??=initialize();const reader=await ready;const result=data.image?await reader.read(data.image):{ready:true};self.postMessage({id:data.id,result});}
  catch(error){ready=null;self.postMessage({id:data.id,error:error.message||String(error)});}
};
