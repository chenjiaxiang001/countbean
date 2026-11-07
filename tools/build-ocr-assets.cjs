const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../vendor/ocr'),chunkDir=path.join(root,'chunks');fs.mkdirSync(chunkDir,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),assets=[],compressed=[];
for(const name of ['ppocr-v4-rec.onnx','ort-wasm-simd-threaded.wasm','ort.wasm.min.js','ort-wasm-simd-threaded.mjs','characters.json']){
 const raw=fs.readFileSync(path.join(root,name)),gz=zlib.gzipSync(raw,{level:9}),parts=[];
 for(let at=0;at<gz.length;at+=256*1024){const part=gz.subarray(at,at+256*1024),sha256=hash(part),file=`chunks/${sha256}.bin`;fs.writeFileSync(path.join(root,file),part);parts.push({file,size:part.length,sha256});}
 assets.push({name,size:raw.length,sha256:hash(raw),packedSize:gz.length,parts});compressed.push(gz);
}
fs.writeFileSync(path.resolve(root,'../../ocr-assets.js'),'globalThis.OCR_ASSETS = '+JSON.stringify(assets)+';\n');
fs.writeFileSync(path.join(root,'countbean-ocr.cbocr'),Buffer.concat([Buffer.from('COUNTBEAN-OCR-1\n'),...compressed]));
console.log(assets.map(a=>({name:a.name,size:a.size,compressed:a.packedSize,parts:a.parts.length})));
