const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {createStaticServer}=require('../tools/serve.cjs');
async function main(){
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.COUNTBEAN_TEST_URL||`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(()=>{state.patterns=[{id:'view-test',name:'镜像与高亮',width:3,height:2,cells:['A1','H2','A1','H2','A1',null],done:{0:true},footerCounts:{A1:3,H2:2}}];state.activePattern='view-test';persist();showView('work');});
 const order=()=>page.locator('#workArea [data-workcell]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.workcell)));
 await page.locator('#workColor').selectOption('A1');assert.equal(await page.locator('#workArea .pattern-cell.dim').count(),3);
 await page.locator('#workHighlight').uncheck();assert.equal(await page.locator('#workArea .pattern-cell.dim').count(),0);
 await page.locator('#workHighlight').check();await page.locator('#workMirrorX').click();assert.deepEqual(await order(),[2,1,0,5,4,3]);
 await page.locator('#workArea [data-workcell="2"]').click();assert.equal(await page.evaluate(()=>state.patterns[0].done[2]),true);
 await page.locator('#workMirrorY').click();assert.deepEqual(await order(),[5,4,3,2,1,0]);
 await page.locator('#nextCell').click();assert.equal(await page.evaluate(()=>state.patterns[0].done[4]),true);
 assert.deepEqual(await page.evaluate(()=>state.patterns[0].cells),['A1','H2','A1','H2','A1',null]);assert.equal(await page.evaluate(()=>state.stock.A1),1000);
 await page.reload();await page.locator('[data-view="work"]').click();assert.deepEqual(await order(),[5,4,3,2,1,0]);assert.equal(await page.locator('#workArea .done').count(),3);
 await page.locator('#workResetView').click();assert.deepEqual(await order(),[0,1,2,3,4,5]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'.local-tests/mobile-work-tools.png'});
 assert.deepEqual(errors,[]);console.log('PASS: highlight, both mirrors, original-cell progress, visual traversal, persistence, inventory unchanged, mobile layout');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
