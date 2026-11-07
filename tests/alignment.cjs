const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {createStaticServer}=require('../tools/serve.cjs');
async function main(){
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('[data-view="patterns"]').click();
 await page.locator('#patternImage').setInputFiles('.local-tests/cat.png');await page.waitForFunction(()=>sourceCanvas?.width===1200);
 await page.locator('#gridCols').fill('46');await page.locator('#gridRows').fill('45');await page.evaluate(()=>cropRect={x:25,y:650,w:1150,h:1125});
 await page.locator('#openAlignment').click();await page.locator('#alignmentPanel summary').click();
 await page.locator('[data-move="1,0"]').click();assert.equal(await page.locator('#align-x').inputValue(),'24');
 await page.locator('[data-scale="0.998"]').click();assert.equal(await page.locator('#align-w').inputValue(),'1147.7');
 await page.locator('#resetAlignment').click();assert.equal(await page.locator('#align-x').inputValue(),'25');
 await page.locator('.alignment-viewport').scrollIntoViewIfNeeded();const b=await page.locator('.alignment-viewport').boundingBox();
 await page.mouse.move(b.x+80,b.y+70);await page.mouse.down();await page.mouse.move(b.x+90,b.y+70,{steps:3});await page.mouse.up();
 assert.ok(Number(await page.locator('#align-x').inputValue())<25,'dragging image right decreases source origin');
 await page.locator('#cancelAlignment').click();assert.equal(await page.evaluate(()=>cropRect.x),25);
 await page.locator('#openAlignment').click();await page.locator('#alignmentZoom').selectOption('4');await page.locator('#alignmentInteraction').selectOption('pan');
 assert.equal(await page.locator('#alignmentCanvas').evaluate(c=>c.style.touchAction),'pan-x pan-y');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('[data-move="1,0"]').click();await page.locator('#applyAlignment').click();assert.equal(await page.evaluate(()=>cropRect.x),24);
 await page.locator('#openAlignment').click();await page.locator('#gridCols').fill('45');await page.locator('#gridCols').dispatchEvent('change');assert.equal(await page.locator('#alignmentPanel').isHidden(),true);
 console.log('PASS: image drag, 1-pixel move, scaling, reset/cancel/apply, zoom/pan, mobile overflow, stale draft invalidation');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
