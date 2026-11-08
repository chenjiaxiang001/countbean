/* Image-only chart analysis. No inventory colors or printed quantities drive cell assignments. */
(function (root) {
  'use strict';
  const median = values => { const v = values.slice().sort((a,b)=>a-b); const m=v.length>>1; return v.length ? (v.length%2?v[m]:(v[m-1]+v[m])/2) : 0; };
  const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  function bounds(image, r) {
    const x=Math.max(0,Math.min(image.width-1,Math.round(r.x))), y=Math.max(0,Math.min(image.height-1,Math.round(r.y)));
    return {x,y,w:Math.max(1,Math.min(image.width-x,Math.round(r.x+r.w)-x)),h:Math.max(1,Math.min(image.height-y,Math.round(r.y+r.h)-y))};
  }
  function pixels(image, rect) {
    const r=bounds(image,rect), out=[];
    for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const i=(y*image.width+x)*4;out.push([image.data[i],image.data[i+1],image.data[i+2]]);}
    return out;
  }
  function dominant(colors) {
    const groups=new Map();
    for(const rgb of colors){const key=Math.floor(rgb[0]/12)*1024+Math.floor(rgb[1]/12)*32+Math.floor(rgb[2]/12);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(rgb);}
    let winner=[];for(const group of groups.values())if(group.length>winner.length)winner=group;
    return [0,1,2].map(c=>median(winner.map(rgb=>rgb[c])));
  }
  function runs(mask) {
    const out=[];let start=-1;
    for(let i=0;i<=mask.length;i++){if(mask[i]&&start<0)start=i;else if(!mask[i]&&start>=0){out.push([start,i]);start=-1;}}
    return out;
  }
  function detectSplitLegendCards(image, rectangle) {
    const r=bounds(image,rectangle),w=r.w,h=r.h,mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),boxes=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=((r.y+y)*image.width+r.x+x)*4;mask[y*w+x]=Math.min(image.data[at],image.data[at+1],image.data[at+2])<235?1:0;}
    // Outlined cards join the colored label and white quantity into one component.
    // Process individual components so a short final row is not discarded by row density.
    for(let seed=0;seed<mask.length;seed++){
      if(!mask[seed]||seen[seed])continue;
      const queue=[seed];seen[seed]=1;let l=w,t=h,rr=0,b=0;
      for(let q=0;q<queue.length;q++){
        const at=queue[q],x=at%w,y=Math.floor(at/w);l=Math.min(l,x);rr=Math.max(rr,x);t=Math.min(t,y);b=Math.max(b,y);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,n=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}}
      }
      const bw=rr-l+1,bh=b-t+1;
      if(bw<45||bh<16||bw/bh<2||bw/bh>6)continue;
      const rect={x:r.x+l,y:r.y+t,w:bw,h:bh};
      const right=dominant(pixels(image,{x:rect.x+bw*.68,y:rect.y+bh*.15,w:bw*.25,h:bh*.7}));
      if(Math.min(...right)<240)continue;
      // A closed border must span most of the card's top and bottom edges.
      const edgeHit=y=>{let hits=0;for(let x=l+3;x<=rr-3;x++)if(mask[y*w+x]||mask[Math.min(h-1,y+1)*w+x])hits++;return hits/(bw-6);};
      if(edgeHit(t)<.7||edgeHit(Math.max(t,b-1))<.7)continue;
      boxes.push(rect);
    }
    if(boxes.length<3)return [];
    const typical=median(boxes.map(b=>b.h));
    const cards=boxes.filter(b=>Math.abs(b.h-typical)<typical*.25).sort((a,b)=>Math.abs(a.y-b.y)<typical*.5?a.x-b.x:a.y-b.y);
    const dividers=cards.flatMap(box=>{
      let best=-1,cut=null;
      for(let x=Math.round(box.w*.30);x<=Math.round(box.w*.60);x++){
        const left=[],right=[];
        for(const y of [3,4,box.h-5,box.h-4]){
          for(const [dx,out] of [[-2,left],[2,right]]){const at=((box.y+y)*image.width+box.x+x+dx)*4;out.push([image.data[at],image.data[at+1],image.data[at+2]]);}
        }
        const l=[0,1,2].map(c=>median(left.map(p=>p[c]))),rr=[0,1,2].map(c=>median(right.map(p=>p[c])));
        const score=distance(l,rr);if(Math.min(...rr)>240&&Math.min(...l)<230&&score>best){best=score;cut=x;}
      }
      return cut===null?[]:[cut/box.w];
    });
    const splitRatio=dividers.length?median(dividers):.43;
    return cards.map((box,id)=>{
      const cut=Math.round(box.w*splitRatio);
      const codeRect={x:box.x+2,y:box.y+2,w:cut-3,h:box.h-4},countRect={x:box.x+cut+2,y:box.y+2,w:box.w-cut-4,h:box.h-4};
      return {id,rect:box,codeRect,countRect,rgb:dominant(pixels(image,codeRect)),layout:'split',code:null,count:null,confidence:0};
    });
  }
  function detectLegendCards(image, rectangle) {
    const split=detectSplitLegendCards(image,rectangle);if(split.length)return split;
    const r=bounds(image,rectangle), rows=[];
    for(let y=r.y;y<r.y+r.h;y++){let n=0;for(let x=r.x;x<r.x+r.w;x++){const i=(y*image.width+x)*4;if(Math.min(image.data[i],image.data[i+1],image.data[i+2])<235)n++;}rows.push(n/r.w>.12);}
    const bands=[];
    for(const [s,e] of runs(rows)){
      if(e-s<7)continue;
      const cols=[];
      for(let x=r.x;x<r.x+r.w;x++){
        const channels=[[],[],[]];for(let y=r.y+s+2;y<r.y+e-2;y++){const i=(y*image.width+x)*4;for(let c=0;c<3;c++)channels[c].push(image.data[i+c]);}
        cols.push(Math.min(...channels.map(median))<235);
      }
      const spans=runs(cols).filter(([l,rr])=>rr-l>=25);
      if(spans.length)bands.push({s,e,spans});
    }
    if(!bands.length)return [];
    const rough=median(bands.flatMap(b=>b.spans.map(([l,rr])=>rr-l)));
    const diffs=bands.flatMap(b=>b.spans.slice(1).map((p,i)=>p[0]-b.spans[i][0]));
    const pitch=diffs.length?median(diffs.map(d=>d/Math.max(1,Math.round(d/rough)))):rough+5;
    const anchor=bands[0].spans[0][0];
    const start=median(bands.flatMap(b=>b.spans.map(([l])=>l-Math.round((l-anchor)/pitch)*pitch)));
    const cards=[];
    for(const band of bands)for(let col=0;col<Math.round((r.w-start)/pitch);col++){
      const rect=bounds(image,{x:r.x+Math.round(start+col*pitch),y:r.y+band.s+2,w:Math.round(pitch)-4,h:band.e-band.s-4});
      const rgb=dominant(pixels(image,rect)), lum=rgb.reduce((a,b)=>a+b)/3;
      const core={x:rect.x+2,y:rect.y+rect.h*.2,w:rect.w-4,h:rect.h*.6};
      const ink=pixels(image,core).filter(p=>Math.abs((p[0]+p[1]+p[2])/3-lum)>40).length;
      if(ink<8)continue;
      const countRect=bands.length===1&&r.h-band.e>=12 ? bounds(image,{x:rect.x,y:r.y+band.e+2,w:rect.w,h:r.h-band.e-2}) : null;
      cards.push({id:cards.length,rect,countRect,rgb,code:null,count:null,confidence:0});
    }
    return cards;
  }
  function crop(image, rectangle) {
    const r=bounds(image,rectangle), data=new Uint8ClampedArray(r.w*r.h*4);
    for(let y=0;y<r.h;y++)data.set(image.data.subarray(((r.y+y)*image.width+r.x)*4,((r.y+y)*image.width+r.x+r.w)*4),y*r.w*4);
    return {data,width:r.w,height:r.h};
  }
  function resizeGray(values,w,h,newW,newH) {
    const result=new Float32Array(newW*newH);
    for(let y=0;y<newH;y++)for(let x=0;x<newW;x++){
      const fx=Math.max(0,Math.min(w-1,(x+.5)*w/newW-.5)),fy=Math.max(0,Math.min(h-1,(y+.5)*h/newH-.5));
      const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),dx=fx-x0,dy=fy-y0;
      result[y*newW+x]=(values[y0*w+x0]*(1-dx)+values[y0*w+x1]*dx)*(1-dy)+(values[y1*w+x0]*(1-dx)+values[y1*w+x1]*dx)*dy;
    }
    return result;
  }
  function textCrop(image, rectangle, rgb, normalized=false) {
    const original=crop(image,rectangle),w=original.width,h=original.height,lum=(rgb[0]+rgb[1]+rgb[2])/3;
    const delta=new Float32Array(w*h),mask=new Uint8Array(w*h),seen=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++){delta[i]=Math.abs((original.data[i*4]+original.data[i*4+1]+original.data[i*4+2])/3-lum);if(delta[i]>40)mask[i]=1;}
    // Remove frame fragments and watermark components connected to the crop boundary.
    for(let seed=0;seed<w*h;seed++){
      if(!mask[seed]||seen[seed])continue;
      const queue=[seed];seen[seed]=1;let edge=false;
      for(let q=0;q<queue.length;q++){
        const at=queue[q],x=at%w,y=Math.floor(at/w);if(x===0||y===0||x===w-1||y===h-1)edge=true;
        for(const next of [x>0?at-1:-1,x<w-1?at+1:-1,y>0?at-w:-1,y<h-1?at+w:-1])if(next>=0&&mask[next]&&!seen[next]){seen[next]=1;queue.push(next);}
      }
      if(edge)for(const at of queue)mask[at]=0;
    }
    let x0=w,y0=h,x1=0,y1=0;const ink=[];
    for(let i=0;i<w*h;i++)if(mask[i]){x0=Math.min(x0,i%w);x1=Math.max(x1,i%w);y0=Math.min(y0,Math.floor(i/w));y1=Math.max(y1,Math.floor(i/w));ink.push(delta[i]);}
    if(ink.length<8)return null;
    x0=Math.max(0,x0-1);y0=Math.max(0,y0-1);x1=Math.min(w-1,x1+1);y1=Math.min(h-1,y1+1);
    const result=crop(original,{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1});
    if(normalized){
      ink.sort((a,b)=>a-b);const scale=255/Math.max(75,ink[Math.min(ink.length-1,Math.floor(ink.length*.9))]);
      for(let y=0;y<result.height;y++)for(let x=0;x<result.width;x++){
        const at=(y+y0)*w+x+x0;let keep=false;
        for(const j of [at,at-1,at+1,at-w,at+w])if(j>=0&&j<mask.length&&mask[j])keep=true;
        const value=keep?255-Math.min(255,delta[at]*scale):255,i=(y*result.width+x)*4;
        result.data[i]=result.data[i+1]=result.data[i+2]=value;
      }
    }
    return result;
  }
  function splitTextFields(image,rgb) {
    const lum=(rgb[0]+rgb[1]+rgb[2])/3,mask=[];
    for(let x=0;x<image.width;x++){let hit=false;for(let y=0;y<image.height;y++){const i=(y*image.width+x)*4;if(Math.abs((image.data[i]+image.data[i+1]+image.data[i+2])/3-lum)>45){hit=true;break;}}mask.push(hit);}
    const parts=runs(mask),gaps=[];
    for(let i=1;i<parts.length;i++){const left=parts[i-1][1],right=parts[i][0];if(left>parts[0][0]+3&&right<parts[parts.length-1][1]-2)gaps.push({size:right-left,cut:(right+left)/2});}
    gaps.sort((a,b)=>b.size-a.size);if(!gaps.length)return null;
    const cut=Math.round(gaps[0].cut);
    return [crop(image,{x:0,y:0,w:cut,h:image.height}),crop(image,{x:cut,y:0,w:image.width-cut,h:image.height})];
  }
  function sampleGrid(image, rectangle, rows,cols) {
    if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||cols<1||rows>160||cols>160)throw Error('行列数必须在 1 到 160 之间。');
    const r=bounds(image,rectangle),cw=r.w/cols,ch=r.h/rows;
    if(cw<8||ch<8)throw Error('每格不足 8 像素，请使用更清晰的原图。');
    const samples=[];
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const x=r.x+col*cw,y=r.y+row*ch,rect={x,y,w:cw,h:ch};
      const background=pixels(image,{x:x+cw*.13,y:y+ch*.13,w:cw*.74,h:ch*.74});
      const rgb=dominant(background),lum=(rgb[0]+rgb[1]+rgb[2])/3;
      let dark=0,light=0;
      for(const p of pixels(image,{x:x+cw*.16,y:y+ch*.3,w:cw*.68,h:ch*.4})){const l=(p[0]+p[1]+p[2])/3;if(l<lum-65)dark++;if(l>lum+65)light++;}
      const ink=Math.max(dark,light),fr=bounds(image,{x:x+cw*.08,y:y+ch*.25,w:cw*.84,h:ch*.5});
      const values=pixels(image,fr).map(p=>Math.min(1,Math.max(0,(Math.abs((p[0]+p[1]+p[2])/3-lum)-25)*2/255)));
      samples.push({rgb,ink,rect,background:new Uint8Array(background.flat()),feature:resizeGray(values,fr.w,fr.h,32,16),row:row+1,col:col+1});
    }
    return samples;
  }
  function similarity(a,b) {
    let best=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      let sum=0,an=0,bn=0;
      for(let y=0;y<16;y++)for(let x=0;x<32;x++){const av=a[y*32+x],xx=x+dx,yy=y+dy,bv=xx>=0&&xx<32&&yy>=0&&yy<16?b[yy*32+xx]:0;sum+=av*bv;an+=av*av;bn+=bv*bv;}
      best=Math.max(best,sum/Math.max(1e-9,Math.sqrt(an*bn)));
    }
    return best;
  }
  function classifySamples(samples, legend) {
    const usable=legend.filter(item=>item.rgb), templates=new Map(),issues=[],verify=[];
    const matches=samples.map(s=>usable.map(entry=>({entry,d:distance(s.rgb,entry.rgb)})).sort((a,b)=>a.d-b.d));
    const cells=samples.map((s,i)=>{
      if(s.ink<4)return null;
      const best=matches[i][0];
      if(!best||best.d>25){
        const evidence=usable.map(entry=>{let hits=0;for(let p=0;p<s.background.length;p+=3)if(distance(s.background.subarray(p,p+3),entry.rgb)<12)hits++;return {entry,hits};}).sort((a,b)=>b.hits-a.hits);
        if(evidence[0]?.entry.code&&evidence[0].hits>=s.background.length/3*.25&&evidence[0].hits>2*(evidence[1]?.hits||0))return evidence[0].entry.code;
        issues.push({index:i,reason:'底色被遮挡或没有对应色号'});return '?';
      }
      if(!best.entry.code){issues.push({index:i,reason:'对应图例色号尚未读出'});return '?';}
      return best.entry.code;
    });
    for(const entry of usable){
      if(!entry.code)continue;
      const indices=cells.map((code,i)=>code===entry.code&&matches[i][0].d<20?i:-1).filter(i=>i>=0);
      indices.sort((a,b)=>((matches[b][1]?.d??100)-matches[b][0].d)-((matches[a][1]?.d??100)-matches[a][0].d));
      if(!indices.length)continue;
      const template=new Float32Array(512),selected=indices.slice(0,20);
      for(const i of selected)for(let j=0;j<512;j++)template[j]+=samples[i].feature[j]/selected.length;
      templates.set(entry.code,template);
    }
    for(let i=0;i<cells.length;i++){
      if(!cells[i]||cells[i]==='?')continue;
      const [first,second]=matches[i];
      if(!second||first.d>25)continue;
      const nearby=matches[i].filter(m=>distance(m.entry.rgb,first.entry.rgb)<18&&templates.has(m.entry.code));
      if(nearby.length<2)continue;
      const scored=nearby.map(m=>({code:m.entry.code,score:similarity(samples[i].feature,templates.get(m.entry.code))})).sort((a,b)=>b.score-a.score);
      if(scored[0].code!==first.entry.code)verify.push(i);
      if(second.d-first.d>=3.5)continue;
      if(scored[0].score>.45)cells[i]=scored[0].code;
      else{cells[i]='?';issues.push({index:i,reason:'相近颜色且格内文字不清晰'});}
    }
    return {cells,issues,verify:[...new Set([...issues.map(item=>item.index),...verify])]};
  }
  function normalizeCode(value) {
    const match=String(value||'').toUpperCase().replace(/\s/g,'').match(/^([A-HM])0*(\d{1,2})$/);
    return match?match[1]+Number(match[2]):null;
  }
  function parseLegendText(text) {
    const raw=String(text||'').toUpperCase().replace(/[（【\[]/g,'(').replace(/[）】\]]/g,')').replace(/[.。]\s*\(/g,'(');
    const match=raw.match(/^\s*([A-HM]\s*0*\d{1,2})\s*\(\s*(\d{1,5})\s*\)?\s*$/);
    if(match)return {code:normalizeCode(match[1]),count:Number(match[2])};
    const code=raw.match(/([A-HM]\s*0*\d{1,2})/);
    return {code:code?normalizeCode(code[1]):null,count:null};
  }
  const api={bounds,pixels,dominant,distance,median,detectLegendCards,crop,textCrop,splitTextFields,sampleGrid,classifySamples,normalizeCode,parseLegendText};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ChartRecognizer=api;
})(typeof globalThis!=='undefined'?globalThis:this);
