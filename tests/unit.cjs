const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../recognizer.js'),Flow=require('../recognition-flow.js');
test('图例合并文本和不同括号不丢色号数量',()=>{
  for(const text of ['C14(205)','C14 （205）','C14 [205]'])assert.deepEqual(E.parseLegendText(text),{code:'C14',count:205});
  assert.deepEqual(E.parseLegendText('G04 (19)'),{code:'G4',count:19});
  assert.deepEqual(E.parseLegendText('H21.(871)'),{code:'H21',count:871});
  assert.equal(E.parseLegendText('C14205').count,null,'不能随意把粘连数字拆成色号和用量');
  assert.equal(Flow.numberFrom('12:50)'),null,'损坏的数字不能当作可靠数量');
});
test('未知色号的图例保留为待校对格，不串到另一色',()=>{
  const sample={rgb:[120,50,30],ink:15,background:new Uint8Array(120).fill(120),feature:new Float32Array(512)};
  assert.deepEqual(E.classifySamples([sample],[{code:null,rgb:[120,50,30]},{code:'H7',rgb:[0,0,0]}]).cells,['?']);
});
test('图例数量不影响格子判色',()=>{
  const sample={rgb:[30,50,70],ink:15,background:new Uint8Array(120),feature:new Float32Array(512)};
  const a=E.classifySamples([sample],[{code:'C1',rgb:[30,50,70],count:0}]);
  const b=E.classifySamples([sample],[{code:'C1',rgb:[30,50,70],count:999}]);
  assert.deepEqual(a.cells,b.cells);
});
test('无文字的白底和棋盘背景不计作豆子',()=>{
  const image={width:24,height:24,data:new Uint8ClampedArray(24*24*4)};
  for(let y=0;y<24;y++)for(let x=0;x<24;x++){const p=(y*24+x)*4,c=(Math.floor(x/4)+Math.floor(y/4))%2?235:255;image.data.set([c,c,c,255],p);}
  const samples=E.sampleGrid(image,{x:0,y:0,w:24,h:24},1,1);
  assert.deepEqual(E.classifySamples(samples,[{code:'H2',rgb:[255,255,255]}]).cells,[null]);
});
test('分栏图例保留仅一张卡片的末行和白底色号',()=>{
  const image={width:400,height:80,data:new Uint8ClampedArray(400*80*4).fill(255)};
  const fill=(x,y,w,h,rgb)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)image.data.set([...rgb,255],(yy*image.width+xx)*4);};
  for(const [x,y,color] of [[5,5,[250,210,100]],[110,5,[255,255,255]],[215,5,[20,30,90]],[5,45,[200,100,50]]]){
    fill(x,y,90,28,[140,140,140]);fill(x+1,y+1,88,26,[255,255,255]);fill(x+1,y+1,37,26,color);fill(x+38,y+1,1,26,[140,140,140]);
  }
  const cards=E.detectLegendCards(image,{x:0,y:0,w:400,h:80});
  assert.equal(cards.length,4);assert.ok(cards.every(c=>c.layout==='split'));assert.equal(cards[3].rect.y,45);
  assert.deepEqual(cards[1].rgb,[255,255,255]);assert.ok(cards[0].codeRect.w>30&&cards[0].codeRect.w<45);
  assert.ok(cards[0].countRect.x>cards[0].codeRect.x+cards[0].codeRect.w);
});
