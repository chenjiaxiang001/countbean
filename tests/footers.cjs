const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
const {createStaticServer}=require('../tools/serve.cjs');
async function main(){const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(process.env.COUNTBEAN_TEST_URL||`http://127.0.0.1:${server.address().port}`);await page.locator('[data-view="patterns"]').click();const results=[];
for(const c of JSON.parse(fs.readFileSync('tests/footer-cases.json'))){
 await page.locator('#patternImage').setInputFiles('.local-tests/'+c.id+'.png');await page.waitForFunction(()=>sourceCanvas&&sourceImage);await page.locator('#gridCols').fill(String(c.cols));await page.locator('#gridRows').fill(String(c.rows));await page.evaluate(c=>{cropRect=c.board;footerRect=c.footer;drawImageCanvas();},c);
 await page.locator('#recognizePattern').click();await page.waitForFunction(()=>!document.querySelector('#recognizePattern').disabled,{},{timeout:120000});
 const r=await page.evaluate(()=>recognitionDraft&&({footer:recognitionDraft.footerCounts,cards:recognitionDraft.legend.map(c=>({code:c.code,count:c.count,layout:c.layout,review:!!c.needsReview,readings:c.readings})),counts:countPattern(recognitionDraft),unknown:recognitionDraft.cells.filter(c=>c==='?').length}));
 assert.ok(r,await page.locator('#recognitionStatus').textContent());assert.deepEqual(r.footer,c.counts,c.id);assert.equal(r.cards.length,Object.keys(c.counts).length);
 assert.equal(await page.locator('#saveRecognized').isDisabled(),true);await page.locator('#confirmFooter').check();assert.equal(await page.locator('#saveRecognized').isDisabled(),false);
 const old=await page.locator('[data-legend-count]').first().inputValue();await page.locator('[data-legend-count]').first().fill(String(Number(old)+1));await page.locator('[data-legend-count]').first().dispatchEvent('change');assert.equal(await page.locator('#confirmFooter').isChecked(),false);assert.equal(await page.locator('#saveRecognized').isDisabled(),true);
 await page.locator('[data-legend-count]').first().fill(old);await page.locator('[data-legend-count]').first().dispatchEvent('change');await page.locator('#confirmFooter').check();
 await page.locator('#recognitionAudit').scrollIntoViewIfNeeded();await page.screenshot({path:'.local-tests/footer-'+c.id+'.png'});
 await page.locator('#saveRecognized').click();assert.equal(await page.evaluate(()=>state.patterns[0].footerConfirmed),true);
 results.push({id:c.id,...r});console.log(c.id,JSON.stringify(r.footer),'unknown',r.unknown);
}
fs.writeFileSync('.local-tests/footer-browser-results.json',JSON.stringify(results,null,2));
assert.equal(await page.evaluate(()=>inventoryUsage({cells:['H2'],footerCounts:{H2:50},footerReviewRequired:true,footerConfirmed:false}).blocked),true);
}finally{await browser.close();await new Promise(r=>server.close(r));}}
main().catch(e=>{console.error(e);process.exitCode=1});
