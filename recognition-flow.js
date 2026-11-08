(function(root){
  'use strict';
  const engine=typeof module!=='undefined'&&module.exports?require('./recognizer.js'):root.ChartRecognizer;
  function numberFrom(text){const m=String(text).trim().match(/^[（(\[【]?\s*(\d{1,5})\s*[）)\]】]?$/);return m?Number(m[1]):null;}
  function codeFrom(text){return engine.normalizeCode(String(text).trim().replace(/^([A-HM])O(?=\d)/,'$10'));}
  async function recognize(image,board,rows,cols,footer,read,options={}){
    const progress=options.onProgress||(()=>{}),valid=options.validCode||(()=>true);
    progress('正在分割图例色块和采样网格…');
    const cards=engine.detectLegendCards(image,footer),samples=engine.sampleGrid(image,board,rows,cols);
    if(!cards.length)throw Error('没有找到图例色块。请紧贴底部统计重新框选，包含色号和数量。');
    for(const card of cards){
      progress(`读取图例 ${card.id+1} / ${cards.length}…`);card.readings=[];
      const raw=engine.textCrop(image,card.codeRect||card.rect,card.rgb),clean=engine.textCrop(image,card.codeRect||card.rect,card.rgb,true);
      const first=await read(raw);card.readings.push(first);let parsed;
      if(card.countRect){
        card.code=codeFrom(first.text);const countImage=engine.textCrop(image,card.countRect,[255,255,255]);const qty=await read(countImage);card.readings.push(qty);card.count=numberFrom(qty.text);
      }else{parsed=engine.parseLegendText(first.text);card.code=parsed.code;card.count=parsed.count;}
      if(!card.code||!valid(card.code)||card.count===null||first.confidence<.82){
        const second=await read(clean);card.readings.push(second);
        if(card.countRect){card.code=codeFrom(second.text)||card.code;}
        else{const p=engine.parseLegendText(second.text);if(p.code&&valid(p.code)&&p.count!==null){card.code=p.code;card.count=p.count;}}
      }
      if(!card.code||!valid(card.code)||card.count===null){
        const parts=raw&&engine.splitTextFields(raw,card.rgb);
        if(parts&&!card.countRect){
          const codeResult=await read(parts[0]),countResult=await read(parts[1]);card.readings.push(codeResult,countResult);
          const code=codeFrom(codeResult.text);if(code&&valid(code)&&!card.code)card.code=code;
          if(card.count===null)card.count=numberFrom(countResult.text);
        }
      }
      if(card.code&&!valid(card.code))card.code=null;
      // A plausible OCR string is not proof of a correct crop. Independently
      // normalize and reread the printed fields; conflicts must remain visible.
      if(card.countRect){
        const checkCode=await read(clean),checkCount=await read(engine.textCrop(image,card.countRect,[255,255,255],true));
        card.readings.push(checkCode,checkCount);
        const code=codeFrom(checkCode.text),count=numberFrom(checkCount.text);
        if(code&&card.code&&code!==card.code){card.suggestedCode=card.code;card.code=null;card.needsReview=true;}
        if(count!==null&&card.count!==null&&count!==card.count){card.suggestedCount=card.count;card.count=null;card.needsReview=true;}
        if(!code||count===null||checkCode.confidence<.85||checkCount.confidence<.85)card.needsReview=true;
      }else{
        const check=await read(clean);card.readings.push(check);const parsed=engine.parseLegendText(check.text);
        if(parsed.code&&card.code&&parsed.code!==card.code){card.suggestedCode=card.code;card.code=null;card.needsReview=true;}
        if(parsed.count!==null&&card.count!==null&&parsed.count!==card.count){card.suggestedCount=card.count;card.count=null;card.needsReview=true;}
        if(!parsed.code||parsed.count===null||check.confidence<.85)card.needsReview=true;
      }
      card.confidence=first.confidence;
      if(((!card.code&&card.suggestedCode)||(card.count===null&&card.suggestedCount!==undefined))&&!card.countRect&&raw){
        const parts=engine.splitTextFields(raw,card.rgb);
        if(parts){
          if(!card.code){const independent=await read(parts[0]);card.readings.push(independent);const code=codeFrom(independent.text);
            if(code===card.suggestedCode&&independent.confidence>=.85)card.code=code;}
          if(card.count===null){const independent=await read(parts[1]);card.readings.push(independent);const count=numberFrom(independent.text);
            if(count===card.suggestedCount&&independent.confidence>=.85)card.count=count;}
        }
      }
      if(!card.code){
        progress(`图例 ${card.id+1} 色号不清，复核同色格中的文字…`);
        const candidates=samples.filter(s=>s.ink>=4&&engine.distance(s.rgb,card.rgb)<18).sort((a,b)=>engine.distance(a.rgb,card.rgb)-engine.distance(b.rgb,card.rgb)).slice(0,3);
        const votes=new Map();
        for(const sample of candidates){
          const r=sample.rect,rect={x:r.x+r.w*.04,y:r.y+r.h*.12,w:r.w*.92,h:r.h*.76};
          const result=await read(engine.textCrop(image,rect,sample.rgb));card.readings.push(result);const code=codeFrom(result.text);
          if(code&&valid(code)){votes.set(code,(votes.get(code)||0)+1);if(votes.get(code)>=2){card.code=code;card.recoveredFromCells=true;break;}}
        }
      }
      if(!card.code||card.count===null)card.needsReview=true;
    }
    const duplicates=new Set(cards.filter((card,i)=>card.code&&cards.some((other,j)=>j!==i&&other.code===card.code)).map(card=>card.code));
    for(const card of cards)if(duplicates.has(card.code)){card.needsReview=true;card.duplicate=true;}
    progress('正在匹配网格，复核相近颜色的字形…');
    const result=engine.classifySamples(samples,cards),autoOverrides={},verificationDetails=[];
    for(let n=0;n<result.verify.length;n++){
      progress(`复核疑难格 ${n+1} / ${result.verify.length}…`);
      const index=result.verify[n],sample=samples[index],r=sample.rect;
      const rect={x:r.x+r.w*.04,y:r.y+r.h*.12,w:r.w*.92,h:r.h*.76};
      let answer=await read(engine.textCrop(image,rect,sample.rgb)),code=codeFrom(answer.text);
      if(!code||answer.confidence<.85){answer=await read(engine.textCrop(image,rect,sample.rgb,true));code=codeFrom(answer.text);}
      verificationDetails.push({index,...answer,code});
      if(code&&answer.confidence>=.85&&cards.some(c=>c.code===code)){result.cells[index]=code;autoOverrides[index]=code;}
      else{result.cells[index]='?';autoOverrides[index]='?';}
    }
    result.issues=result.cells.flatMap((code,index)=>code==='?'?[{index,reason:'文字或底色证据不足，请对照原图'}]:[]);
    const counts={};for(const code of result.cells)if(code&&code!=='?')counts[code]=(counts[code]||0)+1;
    return {...result,autoOverrides,verificationDetails,legend:cards,footerCounts:Object.fromEntries(cards.filter(c=>c.code&&c.count!==null&&!c.duplicate).map(c=>[c.code,c.count])),counts,samples};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={recognize,numberFrom,codeFrom};else root.ChartRecognitionFlow={recognize,numberFrom,codeFrom};
})(typeof globalThis!=='undefined'?globalThis:this);
