/* Fixed reference grid. Only applying commits the pending image transform to the ROI. */
(()=>{
  const host=document.querySelector('#alignmentPanel');
  let draft=null,initial=null,drag=null,frame=null;
  const fields=['x','y','w','h'];
  function draw(){
    const canvas=host.querySelector('canvas');if(!canvas||!draft)return;
    const cols=Number(document.querySelector('#gridCols').value),rows=Number(document.querySelector('#gridRows').value);
    const scale=Math.min(780/cols,780/rows),w=cols*scale,h=rows*scale;
    frame={x:(900-w)/2,y:(900-h)/2,w,h};
    const ctx=canvas.getContext('2d');ctx.fillStyle='#dce3df';ctx.fillRect(0,0,900,900);
    ctx.save();ctx.beginPath();ctx.rect(frame.x,frame.y,w,h);ctx.clip();
    ctx.drawImage(sourceCanvas,frame.x-draft.x*w/draft.w,frame.y-draft.y*h/draft.h,sourceCanvas.width*w/draft.w,sourceCanvas.height*h/draft.h);ctx.restore();
    const overlay=host.querySelector('#alignmentLines').checked;
    if(overlay){for(let c=0;c<=cols;c++){ctx.strokeStyle=c%5===0?'#e84a22dd':'#168c9cb0';ctx.lineWidth=c%5===0?1.7:.8;ctx.beginPath();ctx.moveTo(frame.x+c*scale,frame.y);ctx.lineTo(frame.x+c*scale,frame.y+h);ctx.stroke();}
      for(let r=0;r<=rows;r++){ctx.strokeStyle=r%5===0?'#e84a22dd':'#168c9cb0';ctx.lineWidth=r%5===0?1.7:.8;ctx.beginPath();ctx.moveTo(frame.x,frame.y+r*scale);ctx.lineTo(frame.x+w,frame.y+r*scale);ctx.stroke();}}
    ctx.strokeStyle='#ec481b';ctx.lineWidth=3;ctx.strokeRect(frame.x,frame.y,w,h);
    for(const key of fields)host.querySelector('#align-'+key).value=Math.round(draft[key]*100)/100;
    host.querySelector('#alignmentInfo').textContent=`固定 ${cols} 列 × ${rows} 行 · 每格取样 ${ (draft.w/cols).toFixed(2)} × ${(draft.h/rows).toFixed(2)} 原图像素`;
  }
  function valid(r){return fields.every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.w>=8&&r.h>=8&&r.x+r.w<=sourceCanvas.width+.01&&r.y+r.h<=sourceCanvas.height+.01;}
  function change(next){if(valid(next)){draft=next;draw();return true;}host.querySelector('#alignmentInfo').textContent='已到图片边缘，请缩小范围或反向移动。';return false;}
  function close(){if(!host.hidden)document.querySelector('#recognizePattern').disabled=false;host.hidden=true;draft=null;drag=null;}
  document.querySelector('#openAlignment').onclick=()=>{
    const cols=Number(document.querySelector('#gridCols').value),rows=Number(document.querySelector('#gridRows').value);
    if(!sourceCanvas||!Number.isInteger(cols)||!Number.isInteger(rows)||cols<1||rows<1||cols>160||rows>160)return setRecognitionStatus('先上传原图并填写正确的行列数，再打开固定网格对齐。',true);
    const pitch=Math.min(sourceCanvas.width/cols,sourceCanvas.height/rows)*.9;
    draft=cropRect?{...cropRect}:{x:(sourceCanvas.width-cols*pitch)/2,y:(sourceCanvas.height-rows*pitch)/2,w:cols*pitch,h:rows*pitch};initial={...draft};
    host.hidden=false;document.querySelector('#recognizePattern').disabled=true;
    host.innerHTML=`<h3>固定网格对齐</h3><p>网格保持不动，拖动里面的图片，或用箭头微调。建议先粗选完整网格，再放大并切换“移动视野”检查左上、右上、左下、右下四角与中间格线；排除坐标数字。此功能适用于规则截图，不校正拍照透视。</p><div class="alignment-tools"><label>查看放大 <select id="alignmentZoom"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><label>拖动操作 <select id="alignmentInteraction"><option value="align">对齐图片</option><option value="pan">移动视野</option></select></label><label><input id="alignmentLines" type="checkbox" checked>显示固定网格</label><label>图片移动步长 <select id="alignmentStep"><option value="1">1 像素</option><option value="5">5 像素</option></select></label><button data-move="-1,0">图片 ←</button><button data-move="1,0">图片 →</button><button data-move="0,-1">图片 ↑</button><button data-move="0,1">图片 ↓</button><button data-scale="0.998">放大图片 +</button><button data-scale="1.002">缩小图片 −</button></div><div class="alignment-viewport"><canvas id="alignmentCanvas" width="900" height="900" aria-label="固定网格图片对齐，拖动图片"></canvas></div><p id="alignmentInfo"></p><details><summary>精确调整选区（原图像素）</summary><div class="alignment-fields">${fields.map((k,i)=>`<label>${['左侧 X','顶部 Y','宽度','高度'][i]}<input id="align-${k}" type="number" step="0.1"></label>`).join('')}</div></details><div class="alignment-tools"><button id="applyAlignment" class="primary-button">应用对齐</button><button id="resetAlignment" class="secondary-button">恢复本次初始位置</button><button id="cancelAlignment" class="text-button">取消</button></div>`;
    const canvas=host.querySelector('canvas');
    const point=e=>{const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.x)*900/b.width,y:(e.clientY-b.y)*900/b.height};};
    canvas.onpointerdown=e=>{if(e.button!==0||host.querySelector('#alignmentInteraction').value==='pan')return;const p=point(e);drag={point:p,rect:{...draft}};canvas.setPointerCapture(e.pointerId);};
    canvas.onpointermove=e=>{if(!drag)return;const p=point(e);change({...drag.rect,x:drag.rect.x-(p.x-drag.point.x)*drag.rect.w/frame.w,y:drag.rect.y-(p.y-drag.point.y)*drag.rect.h/frame.h});};
    canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
    host.querySelector('#alignmentZoom').onchange=e=>{canvas.style.width=Number(e.target.value)*100+'%';};
    host.querySelector('#alignmentLines').onchange=draw;
    host.querySelector('#alignmentInteraction').onchange=e=>{drag=null;canvas.style.touchAction=e.target.value==='pan'?'pan-x pan-y':'none';canvas.style.cursor=e.target.value==='pan'?'grab':'move';};
    host.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const [x,y]=b.dataset.move.split(',').map(Number),step=Number(host.querySelector('#alignmentStep').value);change({...draft,x:draft.x-x*step,y:draft.y-y*step});});
    host.querySelectorAll('[data-scale]').forEach(b=>b.onclick=()=>{const f=Number(b.dataset.scale);change({x:draft.x+draft.w*(1-f)/2,y:draft.y+draft.h*(1-f)/2,w:draft.w*f,h:draft.h*f});});
    for(const k of fields)host.querySelector('#align-'+k).onchange=e=>{const value=e.target.value===''?NaN:Number(e.target.value);if(!change({...draft,[k]:value}))draw();};
    host.querySelector('#resetAlignment').onclick=()=>{draft={...initial};draw();};
    host.querySelector('#cancelAlignment').onclick=close;
    host.querySelector('#applyAlignment').onclick=()=>{if(!valid(draft))return;invalidateRecognition();cropRect={...draft};cropTapAnchor=null;cropDrag=null;drawImageCanvas();close();setRecognitionStatus('对齐已应用。请确认底部统计选区，然后重新识别。');};
    draw();host.scrollIntoView({block:'start',behavior:'smooth'});
  };
  // Pending edits must never be applied to a different image or grid size.
  for(const id of ['patternImage','gridCols','gridRows'])document.querySelector('#'+id).addEventListener('change',close);
  document.querySelector('#recognizePattern').addEventListener('click',()=>{if(!host.hidden)close();});
})();
