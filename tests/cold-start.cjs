const {chromium}=require('playwright'),fs=require('node:fs');
const {createStaticServer}=require('../tools/serve.cjs');
async function main(){
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage(),requests=[];
  context.on('request',r=>{if(r.url().includes('/vendor/ocr/'))requests.push(r.url());});
  await page.goto(process.env.COUNTBEAN_TEST_URL||`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});
  const start=Date.now();
  const result=await page.evaluate(async()=>{try{await getOcrWorker();return {ready:true};}catch(e){return {ready:false,error:e.message};}});
  const report={...result,ms:Date.now()-start,chunkRequests:requests.filter(u=>u.includes('/chunks/')).length,largeOriginalRequests:requests.filter(u=>u.endsWith('.onnx')||u.endsWith('.wasm')).length};
  fs.writeFileSync('.local-tests/cold-start.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!result.ready)throw Error(result.error);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
