const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {createStaticServer}=require('../tools/serve.cjs');
async function main(){
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  let failures=0;
  await context.route('**/ppocr-v4-rec.onnx',route=>{failures++;return route.abort('failed');});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const failure=await page.evaluate(async()=>{try{await getOcrWorker();return '';}catch(e){return e.message;}});
  assert.match(failure,/ppocr-v4-rec.onnx/);assert.match(failure,/识别模型加载失败/);assert.equal(failures,3);
  await context.unroute('**/ppocr-v4-rec.onnx');
  assert.equal(await page.evaluate(async()=>{await getOcrWorker();return true;}),true,'retry after failed initialization');
  assert.equal(await page.evaluate(async()=>!!await (await caches.open('countbean-ocr-v1')).match(new URL('vendor/ocr/ppocr-v4-rec.onnx',location.href).href)),true);
  await page.locator('[data-view="patterns"]').click();await page.locator('#patternImage').setInputFiles('.local-tests/cat.png');await page.waitForFunction(()=>sourceCanvas?.width===1200);
  await page.locator('#gridCols').fill('45');await page.locator('#gridRows').fill('45');
  await page.evaluate(()=>{cropRect={x:25,y:650,w:1150,h:1125};footerRect={x:20,y:1798,w:1160,h:77};});
  await page.locator('#recognizePattern').click();assert.match(await page.locator('#dialogContent').innerText(),/46 列/);
  await page.evaluate(()=>document.querySelector('#confirmDialog').close());
  const labels=await page.evaluate(()=>{
    const texts=[],original=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){texts.push(text);return original.call(this,text,...args);};
    const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){};
    try{exportPatternImage({name:'test',width:2,height:1,cells:[null,'H2']});}finally{CanvasRenderingContext2D.prototype.fillText=original;HTMLAnchorElement.prototype.click=click;}
    return texts;
  });assert.ok(labels.includes('H2'));assert.ok(!labels.includes(null));assert.ok(!labels.includes('null'));
  const upgradeContext=await browser.newContext(),upgrade=await upgradeContext.newPage();
  await upgrade.goto(`http://127.0.0.1:${server.address().port}/manifest.json`);
  await upgrade.evaluate(async()=>{
    const cache=await caches.open('countbean-v7');
    await cache.put('/vendor/ocr/characters.json',new Response('migration-test'));
    await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
  });
  await upgrade.waitForFunction(async()=>!(await caches.keys()).includes('countbean-v7'));
  assert.equal(await upgrade.evaluate(async()=>await (await (await caches.open('countbean-ocr-v1')).match('/vendor/ocr/characters.json')).text()),'migration-test');
  console.log('PASS: named download failure, three retries, recovery, persistent model cache, cache migration, 45/46 column warning, blank export');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
