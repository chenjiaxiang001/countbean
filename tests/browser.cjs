const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const {createStaticServer}=require('../tools/serve.cjs');
const regions={cat:{board:{x:25,y:650,w:1150,h:1125},footer:{x:20,y:1798,w:1160,h:77}},bread:{board:{x:37,y:146,w:1206,h:1453},footer:{x:30,y:1630,w:620,h:44}},landscape:{board:{x:23,y:633,w:1153,h:1153},footer:{x:20,y:1810,w:1160,h:78}},pink:{board:{x:39,y:39,w:1201,h:1201},footer:{x:25,y:1277,w:410,h:54}}};
async function main(){
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.COUNTBEAN_TEST_URL||`http://127.0.0.1:${server.address().port}`;
  await page.goto(base);await page.locator('[data-view="patterns"]').click();
  const cases=JSON.parse(fs.readFileSync('tests/cases.json')),results=[];
  for(const fixture of cases){
   await page.locator('#patternImage').setInputFiles(`.local-tests/${fixture.id}.png`);
   await page.waitForFunction(()=>sourceCanvas&&sourceCanvas.width>0);
   await page.locator('#gridCols').fill(String(fixture.cols));await page.locator('#gridRows').fill(String(fixture.rows));
   await page.evaluate(({board,footer})=>{cropRect=board;footerRect=footer;drawImageCanvas();},regions[fixture.id]);
   // Start with an intentionally shifted selection, correct it in the fixed-grid UI.
   await page.evaluate(()=>{cropRect.x+=5;});
   await page.locator('#openAlignment').click();
   await page.locator('#alignmentPanel summary').click();
   await page.locator('#align-x').fill(String(regions[fixture.id].board.x));await page.locator('#align-x').dispatchEvent('change');
   await page.locator('#alignmentZoom').selectOption('2');
   if(fixture.id==='cat')await page.screenshot({path:'.local-tests/mobile-alignment.png'});
   await page.locator('#applyAlignment').click();
   assert.deepEqual(await page.evaluate(()=>cropRect),regions[fixture.id].board);
   await page.locator('#recognizePattern').click();
   await page.waitForFunction(()=>!document.querySelector('#recognizePattern').disabled,{},{timeout:90000});
   const result=await page.evaluate(()=>recognitionDraft?{counts:countPattern(recognitionDraft),footer:recognitionDraft.footerCounts,unknown:recognitionDraft.cells.filter(c=>c==='?').length,status:document.querySelector('#recognitionStatus').textContent,overflow:document.documentElement.scrollWidth>window.innerWidth}:null);
   fs.writeFileSync(`.local-tests/browser-${fixture.id}.json`,JSON.stringify(await page.evaluate(()=>({result:recognitionDraft,samples:recognitionSamples.map(s=>({rgb:s.rgb,ink:s.ink}))})),null,2));
   const canvasPng=await page.evaluate(()=>sourceCanvas.toDataURL('image/png').split(',')[1]);fs.writeFileSync(`.local-tests/${fixture.id}-browser.png`,Buffer.from(canvasPng,'base64'));
   assert.ok(result,await page.locator('#recognitionStatus').textContent());assert.deepEqual(result.footer,fixture.counts,fixture.id+' footer');
   if(fixture.id==='landscape'){assert.deepEqual(result.counts,{...fixture.counts,C24:702});assert.equal(result.unknown,1);assert.equal(await page.evaluate(()=>recognitionDraft.cells[131]),'?');assert.deepEqual(await page.evaluate(()=>[821,1089,1354,1588].map(i=>recognitionDraft.cells[i])),['G1','G1','H18','B23']);}else if(fixture.id!=='bread'){assert.deepEqual(result.counts,fixture.counts,fixture.id+' grid');assert.equal(result.unknown,0);}else{assert.equal(result.unknown,6);assert.equal(result.counts.A21,401);}
   assert.equal(result.overflow,false,'mobile horizontal overflow');
   await page.locator('#recognitionAudit').scrollIntoViewIfNeeded();await page.screenshot({path:`.local-tests/mobile-${fixture.id}.png`});
   if(fixture.id==='bread'){
    await page.locator('#nextDraftUnknown').click();await page.locator('#draftSourceCell').waitFor();
    await page.locator('#draftPaint').selectOption('A21');await page.locator('#applyDraftPaint').click();
    assert.equal(await page.evaluate(()=>recognitionDraft.cells.filter(c=>c==='?').length),5);
    await page.locator('#resetDraftPaint').click();assert.equal(await page.evaluate(()=>recognitionDraft.cells.filter(c=>c==='?').length),6);
    await page.locator('#saveRecognized').click();await page.locator('#patternList [data-pattern="work"]').first().click();assert.equal(await page.locator('#finishWork').isDisabled(),false);await page.locator('#finishWork').click();assert.match(await page.locator('#dialogContent').innerText(),/底部统计.*1,896/);await page.locator('#dialogConfirm').click();assert.equal(await page.evaluate(()=>state.stock.A21),593);assert.equal(await page.locator('#finishWork').isDisabled(),true);await page.locator('[data-view="patterns"]').click();
   }
   if(fixture.id==='pink'){
    const input=page.locator('[data-legend-count]').first();await input.fill('316');await input.dispatchEvent('change');assert.equal(await page.evaluate(()=>recognitionDraft.footerCounts.F22),316);await page.locator('[data-legend-count]').first().fill('315');await page.locator('[data-legend-count]').first().dispatchEvent('change');
   }
   results.push({id:fixture.id,...result});
  }
  await page.locator('#saveRecognized').click();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('countbean-state')));assert.equal(stored.patterns.length,2);assert.equal(stored.stock.H7,1000);
  await page.reload();await page.locator('[data-view="patterns"]').click();assert.equal(await page.locator('#patternList .pattern-row').count(),2);
  // Same-origin runtime/model must be cached for the single-device offline workflow.
  await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await page.locator('[data-view="patterns"]').click();
  await page.locator('#patternImage').setInputFiles('.local-tests/pink.png');await page.waitForFunction(()=>sourceCanvas&&sourceCanvas.width===1280);
  await page.locator('#gridCols').fill('48');await page.locator('#gridRows').fill('48');await page.evaluate(({board,footer})=>{cropRect=board;footerRect=footer;},regions.pink);
  await page.locator('#recognizePattern').click();await page.waitForFunction(()=>!document.querySelector('#recognizePattern').disabled,{},{timeout:90000});assert.equal(await page.evaluate(()=>recognitionDraft?.footerCounts.H7),242,'offline OCR');
  await page.locator('#selectBoard').click();await page.locator('#imageZoom').fill('2');await page.locator('#imageZoom').dispatchEvent('input');
  await page.locator('#imageCanvas').scrollIntoViewIfNeeded();
  const box=await page.locator('#imageCanvas').boundingBox();
  await page.touchscreen.tap(box.x+20,Math.max(100,box.y+20));assert.ok(await page.evaluate(()=>cropTapAnchor));
  await page.touchscreen.tap(box.x+100,Math.max(100,box.y+20)+80);assert.equal(await page.evaluate(()=>cropTapAnchor),null);assert.ok(await page.evaluate(()=>cropRect.w>20&&cropRect.h>20));
  assert.deepEqual(errors,[]);fs.writeFileSync('.local-tests/browser-results.json',JSON.stringify({results,offline:true,errors},null,2));console.log(JSON.stringify({results,offline:true,errors},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
