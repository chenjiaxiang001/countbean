const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createStaticServer}=require('../tools/serve.cjs');
async function main(){
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const parts=await page.evaluate(()=>OCR_ASSETS[0].parts);let block=true;const calls={};
  await context.route('**/chunks/*.bin',route=>{const file=route.request().url().split('/').pop();calls[file]=(calls[file]||0)+1;return block&&file===parts[2].file.split('/').pop()?route.abort('failed'):route.continue();});
  const failure=await page.evaluate(async()=>{try{await OCRDownload.load('ppocr-v4-rec.onnx');return '';}catch(e){return e.message;}});
  assert.match(failure,/块下载失败/);assert.equal(calls[parts[2].file.split('/').pop()],3);
  const firstCalls=calls[parts[0].file.split('/').pop()];assert.equal(firstCalls,1);block=false;
  assert.equal(await page.evaluate(async()=>(await OCRDownload.load('ppocr-v4-rec.onnx')).byteLength),10857958);
  assert.equal(calls[parts[0].file.split('/').pop()],firstCalls,'completed chunks are not fetched again');
  // A damaged full-file cache must be detected and rebuilt from verified chunks.
  await page.evaluate(async()=>{await (await caches.open('countbean-ocr-v1')).put(new URL('vendor/ocr/ppocr-v4-rec.onnx',location.href),new Response('broken'));});
  assert.equal(await page.evaluate(async()=>(await OCRDownload.load('ppocr-v4-rec.onnx')).byteLength),10857958);
  assert.equal(calls[parts[0].file.split('/').pop()],firstCalls);
  const offline=await browser.newContext(),p=await offline.newPage();await p.goto(`http://127.0.0.1:${server.address().port}`);
  await p.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
  await p.locator('[data-view="patterns"]').click();
  const originalState=await p.evaluate(()=>{state.stock.H2=731;persist();return localStorage.getItem('countbean-state');});
  await offline.setOffline(true);
  const bad=Buffer.from(fs.readFileSync('vendor/ocr/countbean-ocr.cbocr'));bad[1000]^=255;
  await p.locator('#offlineOcrFile').setInputFiles({name:'damaged.cbocr',mimeType:'application/octet-stream',buffer:bad});
  await p.waitForFunction(()=>!document.querySelector('#offlineOcrFile').disabled);
  assert.equal(await p.evaluate(async()=>!!await (await caches.open('countbean-ocr-v1')).match(new URL('vendor/ocr/ppocr-v4-rec.onnx',location.href))),false,'bad package is not installed');
  await p.locator('#offlineOcrFile').setInputFiles('vendor/ocr/countbean-ocr.cbocr');await p.waitForFunction(()=>document.querySelector('#offlineOcrStatus').textContent.startsWith('离线识别包已保存'));
  assert.equal(await p.evaluate(()=>localStorage.getItem('countbean-state')),originalState);
  assert.equal(await p.evaluate(async()=>{await getOcrWorker();return true;}),true,'engine starts without any network or preloaded OCR resources');
  await p.reload();assert.equal(await p.evaluate(async()=>{await getOcrWorker();return true;}),true,'offline import persists after reload');
  console.log('PASS: fresh chunk downloads, retries, resume, corruption recovery, invalid package rejection, fresh offline import/engine/reload, stock preserved');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});

