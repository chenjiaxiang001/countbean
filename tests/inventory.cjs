const {chromium}=require('playwright'),assert=require('node:assert/strict');
const {createStaticServer}=require('../tools/serve.cjs');
async function main(){
  const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();await page.goto(process.env.COUNTBEAN_TEST_URL||`http://127.0.0.1:${server.address().port}`);
    async function setup(footer,cells=['A21','?']){
      await page.evaluate(({footer,cells})=>{
        state.stock.A21=1000;state.stock.H2=1000;
        state.patterns=[{id:'test',name:'库存规则测试',width:cells.length,height:1,cells,done:{},footerCounts:footer}];
        state.activePattern='test';showView('work');renderWork();
      },{footer,cells});
    }
    await setup({A21:407,H2:5});
    assert.equal(await page.locator('#finishWork').isDisabled(),false);
    await page.locator('#finishWork').click();
    assert.match(await page.locator('#dialogContent').innerText(),/底部统计/);
    assert.match(await page.locator('#dialogContent').innerText(),/H2：5/);
    await page.locator('#dialogConfirm').click();
    assert.deepEqual(await page.evaluate(()=>[state.stock.A21,state.stock.H2]),[593,995]);
    assert.equal(await page.locator('#finishWork').isDisabled(),true);
    await page.reload();
    assert.equal(await page.evaluate(()=>state.patterns[0].consumption.source),'footer');
    assert.equal(await page.evaluate(()=>state.stock.A21),593);
    await setup({A21:1001});assert.equal(await page.locator('#finishWork').isDisabled(),true);
    await setup({H2:5},['A21']);await page.locator('#finishWork').click();await page.locator('#dialogConfirm').click();
    assert.deepEqual(await page.evaluate(()=>[state.stock.A21,state.stock.H2]),[1000,995],'Do not mix grid-only colors into footer deduction');
    await setup(undefined);assert.equal(await page.locator('#finishWork').isDisabled(),true);
    await setup({},['A21','A21']);await page.locator('#finishWork').click();await page.locator('#dialogConfirm').click();
    assert.equal(await page.evaluate(()=>state.stock.A21),998);
    for(const counts of [{A21:-1},{A21:1.5},{A21:null},{X99:3}]){
      await setup(counts,['A21']);assert.equal(await page.locator('#finishWork').isDisabled(),true);
    }
    console.log('PASS: footer authority, missing grid color, shortages, persistence, repeat guard, grid fallback, invalid quantities');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
