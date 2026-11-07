const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {PNG}=require('pngjs'),ort=require('onnxruntime-web');
const E=require('../recognizer.js'),Flow=require('../recognition-flow.js'),TextReader=require('../ocr-runtime.js');
ort.env.wasm.numThreads=1;
const regions={cat:{board:{x:25,y:650,w:1150,h:1125},footer:{x:20,y:1798,w:1160,h:77}},bread:{board:{x:37,y:146,w:1206,h:1453},footer:{x:30,y:1630,w:620,h:44}},landscape:{board:{x:23,y:633,w:1153,h:1153},footer:{x:20,y:1810,w:1160,h:78}},pink:{board:{x:39,y:39,w:1201,h:1201},footer:{x:25,y:1277,w:410,h:54}}};
async function main(){
  const session=await ort.InferenceSession.create(fs.readFileSync('vendor/ocr/ppocr-v4-rec.onnx'),{executionProviders:['wasm']});
  const reader=new TextReader(ort,session,JSON.parse(fs.readFileSync('vendor/ocr/characters.json')));
  const cases=JSON.parse(fs.readFileSync('tests/cases.json')),report=[];
  const root=process.env.COUNTBEAN_FIXTURES||'.local-tests';
  global.window={};require('../palette-data.js');const valid=new Set(window.seedPalette.map(c=>c.code));
  for(const fixture of cases){
    const image=PNG.sync.read(fs.readFileSync(path.join(root,fixture.id+'.png'))),region=regions[fixture.id],start=performance.now();
    const result=await Flow.recognize(image,region.board,fixture.rows,fixture.cols,region.footer,img=>reader.read(img),{validCode:code=>valid.has(code)});
    const footerDiff=Object.entries(fixture.counts).filter(([code,count])=>result.footerCounts[code]!==count).map(([code,count])=>({code,expected:count,actual:result.footerCounts[code]??null}));
    const gridDiff=Object.entries(fixture.counts).filter(([code,count])=>(result.counts[code]||0)!==count).map(([code,count])=>({code,expected:count,actual:result.counts[code]||0}));
    const stats={id:fixture.id,ms:Math.round(performance.now()-start),cards:result.legend.length,footerDiff,gridDiff,unknown:result.cells.filter(c=>c==='?').length,occupied:result.cells.filter(c=>c!==null).length,legend:result.legend,cells:result.cells,issues:result.issues};
    report.push(stats);console.log(JSON.stringify({...stats,legend:result.legend.map(c=>({code:c.code,count:c.count,rgb:c.rgb,readings:c.readings})),cells:undefined,issues:undefined},null,2));
    const preview=new PNG({width:fixture.cols*12,height:fixture.rows*12});
    result.cells.forEach((code,i)=>{const rgb=code==='?'?[245,60,90]:result.legend.find(c=>c.code===code)?.rgb||[255,255,255];for(let y=0;y<12;y++)for(let x=0;x<12;x++){const pos=(((Math.floor(i/fixture.cols)*12+y)*preview.width)+(i%fixture.cols)*12+x)*4;preview.data[pos]=rgb[0];preview.data[pos+1]=rgb[1];preview.data[pos+2]=rgb[2];preview.data[pos+3]=255;}});
    fs.writeFileSync(path.join(root,fixture.id+'-actual.png'),PNG.sync.write(preview));
  }
  fs.writeFileSync(path.join(root,'regression-results.json'),JSON.stringify(report,null,2));
  await session.release();
  if(process.argv.includes('--assert'))for(const r of report){assert.equal(r.footerDiff.length,0,`${r.id}: footer mismatch`);if(r.id==='landscape'){assert.equal(r.unknown,1);assert.deepEqual(r.gridDiff,[{code:'H18',expected:406,actual:405}]);assert.equal(r.cells[1561],'?');}else if(r.id!=='bread'){assert.equal(r.gridDiff.length,0,`${r.id}: grid counts mismatch`);assert.equal(r.unknown,0);}else{assert.equal(r.unknown,6);assert.deepEqual(r.gridDiff,[{code:'A21',expected:407,actual:401}]);}}
}
main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={regions};
