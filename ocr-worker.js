importScripts('./vendor/ocr/ort.wasm.min.js','./ocr-runtime.js');
let ready;
async function initialize(){
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=new URL('./vendor/ocr/',self.location.href).href;
  const response=await fetch('./vendor/ocr/ppocr-v4-rec.onnx');
  if(!response.ok)throw Error('识别模型下载失败，请检查网络后重试。');
  const model=await response.arrayBuffer();
  const dictResponse=await fetch('./vendor/ocr/characters.json');
  if(!dictResponse.ok)throw Error('识别字典下载失败。');
  const characters=await dictResponse.json();
  const session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});
  return new ChartTextReader(ort,session,characters);
}
self.onmessage=async({data})=>{
  try{ready??=initialize();const reader=await ready;const result=data.image?await reader.read(data.image):{ready:true};self.postMessage({id:data.id,result});}
  catch(error){ready=null;self.postMessage({id:data.id,error:error.message||String(error)});}
};
