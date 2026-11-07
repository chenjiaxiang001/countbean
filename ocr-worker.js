importScripts('./ocr-assets.js','./ocr-download.js','./ocr-runtime.js');
let ready;
async function initialize(progress){
  const script=await OCRDownload.load('ort.wasm.min.js',progress);
  const scriptUrl=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
  try{importScripts(scriptUrl);}finally{URL.revokeObjectURL(scriptUrl);}
  ort.env.wasm.numThreads=1;
  const model=await OCRDownload.load('ppocr-v4-rec.onnx',progress);
  const characters=JSON.parse(new TextDecoder().decode(await OCRDownload.load('characters.json',progress)));
  ort.env.wasm.wasmBinary=await OCRDownload.load('ort-wasm-simd-threaded.wasm',progress);
  const mjs=await OCRDownload.load('ort-wasm-simd-threaded.mjs',progress);
  // Preserve relative resource URLs when executing the verified module from a Blob.
  const moduleSource=new TextDecoder().decode(mjs).replaceAll('import.meta.url',JSON.stringify(new URL('./vendor/ocr/ort-wasm-simd-threaded.mjs',self.location.href).href));
  const mjsUrl=URL.createObjectURL(new Blob([moduleSource],{type:'text/javascript'}));
  ort.env.wasm.wasmPaths={mjs:mjsUrl};
  progress('下载完成，正在启动本地识别引擎…');
  try{
    const session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});
    return new ChartTextReader(ort,session,characters);
  }catch(error){throw Error('识别引擎启动失败，请使用新版浏览器重试。'+error.message);}
  finally{URL.revokeObjectURL(mjsUrl);}
}
self.onmessage=async({data})=>{
  try{ready??=initialize(progress=>self.postMessage({id:data.id,progress}));const reader=await ready;const result=data.image?await reader.read(data.image):{ready:true};self.postMessage({id:data.id,result});}
  catch(error){ready=null;self.postMessage({id:data.id,error:error.message||String(error)});}
};
