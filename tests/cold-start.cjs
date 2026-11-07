const {chromium}=require('playwright'),fs=require('node:fs');
const {createStaticServer}=require('../tools/serve.cjs');
async function main(){
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage(),requests=[];
  context.on('request',r=>{if(r.url().includes('/vendor/ocr/'))requests.push(r.url());});
  await page.goto(process.env.COUNTBEAN_TEST_URL||`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});
  const start=Date.now();
  let last='';const progressTimer=setInterval(async()=>{try{const status=await page.locator('#recognitionStatus').textContent();if(status!==last){last=status;console.log(status);}}catch{}},10000);
  let deadline;
  const result=await Promise.race([
    page.evaluate(async()=>{try{await getOcrWorker();return {ready:true};}catch(e){return {ready:false,error:e.message};}}),
    new Promise(resolve=>{deadline=setTimeout(()=>resolve({ready:false,error:'Cold-start test exceeded 180 seconds',lastProgress:last}),180000);})
  ]);clearInterval(progressTimer);clearTimeout(deadline);
  const report={...result,ms:Date.now()-start,chunkRequests:requests.filter(u=>u.includes('/chunks/')).length,largeOriginalRequests:requests.filter(u=>u.endsWith('.onnx')||u.endsWith('.wasm')).length};
  fs.writeFileSync('.local-tests/cold-start.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!result.ready)throw Error(result.error);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
