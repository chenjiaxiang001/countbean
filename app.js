const palette = window.seedPalette;
const colorMap = new Map(palette.map(item => [item.code, item]));
const defaultState = () => ({ version: 1, stock: Object.fromEntries(palette.map(item => [item.code, 1000])), patterns: [], activePattern: null });
let state = loadState();
let editPatternId = null;
let currentWorkColor = 'all';
let selectedEditColor = palette[0].code;
let highlightEditColor = false;
let cellSize = 18;
let sourceImage = null;
let cropRect = null;
let footerRect = null;
let cropDrag = null;
let cropTapAnchor = null;
let pointerStart = null;
let selectionMode = 'board';
let recognitionDraft = null;
let samplingLegendIndex = null;
let recognitionSamples = null;
let draftHighlight = "all";
let draftSelection = null;
let ocrSequence = 0;
const ocrRequests = new Map();
let ocrWorker = null;
let ocrWorkerPromise = null;
let sourceCanvas = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('countbean-state'));
    if (saved?.version === 1 && saved.stock && Array.isArray(saved.patterns)) return { ...defaultState(), ...saved };
  } catch {}
  return defaultState();
}
function persist() { localStorage.setItem('countbean-state', JSON.stringify(state)); }
function esc(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function fmt(value) { return Number(value || 0).toLocaleString('zh-CN'); }
function showView(name) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `${name}View`));
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  if (name === 'work') renderWork();
  if (name === 'patterns') renderPatterns();
}
function renderInventory() {
  const query = document.querySelector('#colorSearch').value.trim().toUpperCase();
  const filter = document.querySelector('#inventoryFilter').value;
  const list = palette.filter(({ code }) => {
    const qty = Number(state.stock[code] ?? 0);
    return code.includes(query) && (filter === 'all' || filter === 'low' && qty < 100 || filter === 'zero' && qty === 0);
  });
  const total = palette.reduce((sum, { code }) => sum + Number(state.stock[code] || 0), 0);
  document.querySelector('#colorCount').textContent = palette.length;
  document.querySelector('#beadTotal').textContent = fmt(total);
  document.querySelector('#lowCount').textContent = palette.filter(({ code }) => Number(state.stock[code] || 0) < 100).length;
  const host = document.querySelector('#inventoryGrid');
  host.innerHTML = list.length ? list.map(({ code, color }) => {
    const qty = Number(state.stock[code] ?? 0);
    return `<article class="color-item" data-code="${code}"><div class="color-swatch" style="background:${color}"></div><div class="color-item-top"><span class="color-code">${code}</span>${qty < 100 ? '<span class="low-tag">偏少</span>' : ''}</div><div class="color-quantity"><span>库存</span><strong>${fmt(qty)}</strong></div><div class="stock-controls"><button data-stock="-100" aria-label="${code}减少100">−100</button><button data-stock="-1" aria-label="${code}减少1">−</button><input type="number" min="0" step="1" value="${qty}" aria-label="${code}库存数量"><button data-stock="1" aria-label="${code}增加1">＋</button></div></article>`;
  }).join('') : '<div class="empty-list">没有匹配的色号</div>';
}
function renderPatterns() {
  const host = document.querySelector('#patternList');
  host.innerHTML = state.patterns.length ? state.patterns.map(pattern => {
    const counts = countPattern(pattern);
    const done = Object.values(pattern.done || {}).filter(Boolean).length;
    const thumb = pattern.cells.filter(code => colorMap.has(code)).slice(0, 16).map(code => `<i style="background:${colorMap.get(code).color}"></i>`).join('');
    const unknown = pattern.cells.filter(code => code === '?').length;
    return `<article class="pattern-row"><div class="pattern-thumb">${thumb}</div><div class="pattern-info"><strong>${esc(pattern.name)}</strong><p>${pattern.width} × ${pattern.height} 格 · ${fmt(Object.values(counts).reduce((a,b)=>a+b,0))} 颗 · ${done} 已完成${unknown ? ` · ${unknown} 格待校对` : ''}</p></div><div class="row-actions"><button data-pattern="edit" data-id="${pattern.id}">编辑</button><button data-pattern="work" data-id="${pattern.id}">开始拼</button><button data-pattern="delete" data-id="${pattern.id}">删除</button></div></article>`;
  }).join('') : '<div class="empty-list">还没有图纸。上传拼豆图纸图片，或展开手动导入。</div>';
  if (editPatternId) renderEditor(editPatternId);
}
function countPattern(pattern) { return pattern.cells.reduce((counts, code) => { if (colorMap.has(code)) counts[code] = (counts[code] || 0) + 1; return counts; }, {}); }
function inventoryUsage(pattern) {
  const entries = Object.entries(pattern.footerCounts || {});
  const fromFooter = entries.length > 0;
  const counts = fromFooter ? { ...pattern.footerCounts } : countPattern(pattern);
  const invalid = entries.some(([code,count]) => !colorMap.has(code) || !Number.isSafeInteger(count) || count < 0);
  const blocked = invalid || (!fromFooter && pattern.cells.includes('?'));
  return { counts, fromFooter, blocked, total: Object.values(counts).reduce((sum,n)=>sum+n,0) };
}
function patternColor(pattern,code){const rgb=pattern.legend?.find(c=>c.code===code)?.rgb;return rgb?`rgb(${rgb.join(',')})`:colorMap.get(code)?.color||(code==='?'?'#f5d1cc':'#fff');}
function patternTextColor(pattern,code){const rgb=pattern.legend?.find(c=>c.code===code)?.rgb;const hex=colorMap.get(code)?.color;const c=rgb||(hex?[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)):[255,255,255]);return c[0]*.299+c[1]*.587+c[2]*.114<135?'#fff':'#18211d';}
function gridMarkup(pattern, { mode = 'edit', chosen = 'all', size = cellSize, highlight = false } = {}) {
  const parts = ['<span class="coordinate-label corner">·</span>'];
  for (let col = 1; col <= pattern.width; col++) parts.push(`<span class="coordinate-label">${col}</span>`);
  for (let row = 0; row < pattern.height; row++) {
    parts.push(`<span class="coordinate-label row-label">${row + 1}</span>`);
    for (let col = 0; col < pattern.width; col++) {
      const view = mode === 'work' ? pattern.workView || {} : {};
      const index = (view.mirrorY ? pattern.height-1-row : row) * pattern.width + (view.mirrorX ? pattern.width-1-col : col); const code = pattern.cells[index];
      const dim = mode === 'work' || mode === 'draft' ? chosen !== 'all' && code !== chosen && (mode !== 'work' || pattern.workView?.highlight !== false) : highlight && selectedEditColor !== code;
      const done = mode === 'work' && pattern.done?.[index];
      const key = mode === 'work' ? 'workcell' : mode === 'draft' ? 'draftcell' : 'cell';
      const color = patternColor(pattern,code);
      const label = code === '?' ? '?' : code || '';
      parts.push(`<button class="pattern-cell ${code === '?' ? 'unknown' : ''} ${dim ? 'dim' : ''} ${done ? 'done' : ''}" data-${key}="${index}" title="第 ${row + 1} 行 · 第 ${col + 1} 列 · ${code === '?' ? '待校对' : code || '空格'}" style="background:${color};color:${patternTextColor(pattern,code)}">${size >= 24 || mode === 'work' ? esc(label) : ''}</button>`);
    }
  }
  return `<div class="pattern-canvas" style="--cell-size:${size}px;grid-template-columns:30px repeat(${pattern.width}, ${size}px);grid-template-rows:30px repeat(${pattern.height}, ${size}px)">${parts.join('')}</div>`;
}
function parseGrid(text) {
  return text.trim().split(/\r?\n/).map(line => line.trim().split(/[\s,，;；|]+/).filter(Boolean).map(code => code.toUpperCase()));
}
function importGrid() {
  const rows = parseGrid(document.querySelector('#patternInput').value);
  if (!rows.length || !rows[0]?.length) return alert('请先粘贴色号网格。');
  const width = Math.max(...rows.map(row => row.length));
  const cells = rows.flatMap(row => Array.from({ length: width }, (_, i) => !row[i] ? null : colorMap.has(row[i]) ? row[i] : '?'));
  const name = document.querySelector('#patternName').value.trim() || `图纸 ${state.patterns.length + 1}`;
  const pattern = { id: crypto.randomUUID(), name, width, height: rows.length, cells, done: {} };
  state.patterns.unshift(pattern); state.activePattern = pattern.id; persist();
  document.querySelector('#patternInput').value = ''; document.querySelector('#patternName').value = '';
  renderPatterns(); showView('patterns'); editPatternId = pattern.id; renderEditor(pattern.id);
}
function setRecognitionStatus(message, error = false) {
  const status = document.querySelector('#recognitionStatus');
  status.hidden = false;
  status.classList.toggle('error', error);
  status.textContent = message;
}
function drawImageCanvas() {
  const canvas = document.querySelector('#imageCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (sourceCanvas) ctx.drawImage(sourceCanvas, 0, 0);
  const shadeOutside = (rect, color) => {
    if (!rect) return;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, rect.y);
    ctx.fillRect(0, rect.y + rect.h, canvas.width, canvas.height - rect.y - rect.h);
    ctx.fillRect(0, rect.y, rect.x, rect.h);
    ctx.fillRect(rect.x + rect.w, rect.y, canvas.width - rect.x - rect.w, rect.h);
  };
  const activeRect = selectionMode === 'board' ? cropRect : footerRect;
  if (activeRect) shadeOutside(activeRect, '#10221c77');
  if (cropRect) { ctx.strokeStyle = '#ffed8b'; ctx.lineWidth = Math.max(3, canvas.width / 500); ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h); }
  if(cropRect&&document.querySelector('#gridOverlay').checked){
    const cols=Number(document.querySelector('#gridCols').value),rows=Number(document.querySelector('#gridRows').value);
    if(cols>0&&cols<=160&&rows>0&&rows<=160){ctx.strokeStyle='#f4bd6388';ctx.lineWidth=1;ctx.beginPath();for(let c=1;c<cols;c++){const x=cropRect.x+cropRect.w*c/cols;ctx.moveTo(x,cropRect.y);ctx.lineTo(x,cropRect.y+cropRect.h);}for(let r=1;r<rows;r++){const y=cropRect.y+cropRect.h*r/rows;ctx.moveTo(cropRect.x,y);ctx.lineTo(cropRect.x+cropRect.w,y);}ctx.stroke();}
  }
  if (footerRect) { ctx.strokeStyle = '#69e0d2'; ctx.lineWidth = Math.max(3, canvas.width / 500); ctx.strokeRect(footerRect.x, footerRect.y, footerRect.w, footerRect.h); }
  if(cropTapAnchor){ctx.strokeStyle='#ff8b40';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(cropTapAnchor.x-15,cropTapAnchor.y);ctx.lineTo(cropTapAnchor.x+15,cropTapAnchor.y);ctx.moveTo(cropTapAnchor.x,cropTapAnchor.y-15);ctx.lineTo(cropTapAnchor.x,cropTapAnchor.y+15);ctx.stroke();}
}
function loadImageFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.querySelector('#imageCanvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    sourceCanvas = document.createElement('canvas'); sourceCanvas.width = canvas.width; sourceCanvas.height = canvas.height;
    sourceCanvas.getContext('2d').drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceImage = image; cropRect = null; footerRect = null; recognitionDraft = null; recognitionSamples = null; samplingLegendIndex = null; draftSelection = null; selectionMode = 'board';
    document.querySelector('#recognitionPreview').hidden = true;
    document.querySelector('#imageStage').hidden = false;
    document.querySelector('#roiSelectors').hidden = false;
    document.querySelector('#recognitionFields').hidden = false;
    document.querySelector('#recognitionStatus').hidden = true;
    document.querySelector('#recognitionAudit').hidden = true;
    document.querySelector('#saveRecognized').hidden = true;
    cropTapAnchor=null;pointerStart=null;document.querySelector('#cropHelp').textContent = '先点网格内侧左上角，滚动图片后再点右下角；不要包含坐标';
    document.querySelector('#selectBoard').classList.add('selected');
    document.querySelector('#selectLegend').classList.remove('selected');
    document.querySelector('#patternName').value = file.name.replace(/\.[^.]+$/, '');
    drawImageCanvas(); URL.revokeObjectURL(url);
  };
  image.onerror = () => { URL.revokeObjectURL(url); setRecognitionStatus('图片无法读取，请换一张 PNG 或 JPG。', true); };
  image.src = url;
}

async function getOcrWorker() {
  if (ocrWorkerPromise) return ocrWorkerPromise;
  ocrWorkerPromise = (async () => {
    const worker = new Worker('./ocr-worker.js');
    ocrWorker = worker;
    worker.onmessage = ({data}) => {
      const request=ocrRequests.get(data.id);if(!request)return;if(data.progress){setRecognitionStatus(data.progress);return;}ocrRequests.delete(data.id);
      if(data.error)request.reject(new Error(data.error));else request.resolve(data.result);
    };
    worker.onerror = () => {
      for(const request of ocrRequests.values())request.reject(new Error('识别引擎未能启动，请更新浏览器或检查网络后重试。'));
      ocrRequests.clear();worker.terminate();ocrWorker=null;ocrWorkerPromise=null;
    };
    await sendOcrRequest(null);
    return worker;
  })();
  try{return await ocrWorkerPromise;}catch(error){ocrWorker?.terminate();ocrWorker=null;ocrWorkerPromise=null;throw error;}
}
function sendOcrRequest(image) {
  return new Promise((resolve,reject)=>{const id=++ocrSequence;ocrRequests.set(id,{resolve,reject});ocrWorker.postMessage({id,image});});
}
function sourcePixels(){return sourceCanvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,sourceCanvas.width,sourceCanvas.height);}
function updateRecognitionDraft(reclassify=true) {
  if(!recognitionDraft)return;
  if(reclassify&&recognitionSamples){
    const result=ChartRecognizer.classifySamples(recognitionSamples,recognitionDraft.legend);
    recognitionDraft.cells=result.cells;recognitionDraft.issues=result.issues;
    for(const [index,code] of Object.entries(recognitionDraft.autoOverrides||{}))if(code==='?'||recognitionDraft.legend.some(c=>c.code===code))recognitionDraft.cells[Number(index)]=code;
    for(const [index,code] of Object.entries(recognitionDraft.overrides||{}))recognitionDraft.cells[Number(index)]=code;
  }
  recognitionDraft.footerCounts=Object.fromEntries(recognitionDraft.legend.filter(item=>colorMap.has(item.code)&&item.count!==null).map(item=>[item.code,item.count]));
  renderRecognitionAudit(recognitionDraft);renderRecognitionPreview();
}
function renderRecognitionAudit(pattern) {
  const host=document.querySelector('#recognitionAudit'),counts=countPattern(pattern);
  const unknown=pattern.cells.filter(code=>code==='?').length;
  const occupied=pattern.cells.filter(code=>code!==null).length;
  const unresolved=pattern.legend.some((item,i)=>!colorMap.has(item.code)||item.count===null||pattern.legend.some((other,j)=>j!==i&&other.code===item.code));
  const mismatch=pattern.legend.filter(item=>item.code&&item.count!==null&&(counts[item.code]||0)!==item.count).length;
  host.hidden=false;
  host.innerHTML=`<strong>网格 ${pattern.width} × ${pattern.height} · 有豆 ${occupied} 格 · 待校对 ${unknown} 格</strong><p>图例读到 ${pattern.legend.length} 个色块；${mismatch?`${mismatch} 色数量不一致，请对照原图`:'已读出的数量与网格吻合'}。库存扣减以保存后的底部统计为准，不会强行改格子凑数。</p><section class="legend-editor"><h3>底部统计校对</h3><p>左侧保留原图色块，右侧可修正色号或数量。取色只用于纠正个别样本。</p><div class="legend-table-head"><span>原图</span><span>色号</span><span>图例颗数</span><span>网格颗数</span><span>校对</span></div>${pattern.legend.map((item,index)=>`<div class="legend-edit-row ${(item.count!==null&&(counts[item.code]||0)!==item.count)||!item.code?'mismatch':''}" data-legend-index="${index}"><canvas data-legend-source="${index}" width="150" height="52" aria-label="图例 ${index+1} 原图"></canvas><select data-legend-code aria-label="图例 ${index+1} 色号"><option value="">未读出</option>${palette.map(({code})=>`<option value="${code}" ${code===item.code?'selected':''}>${code}</option>`).join('')}</select><input data-legend-count aria-label="${item.code||'未读色号'} 图例数量" type="number" min="0" step="1" value="${item.count??''}" placeholder="未读"><strong>${counts[item.code]||0}</strong><div class="legend-row-actions"><button type="button" data-sample-index="${index}" class="secondary-button">${samplingLegendIndex===index?'取消取色':'取色'}</button><button type="button" data-remove-legend="${index}" aria-label="移除图例 ${index+1}">×</button></div>${item.recoveredFromCells?'<small>色号已用同色格文字复核</small>':''}</div>`).join('')}<div class="legend-add"><select id="addLegendCode" aria-label="补充色号">${palette.filter(({code})=>!pattern.legend.some(item=>item.code===code)).map(({code})=>`<option value="${code}">${code}</option>`).join('')}</select><button type="button" class="secondary-button" id="addLegend">补充色号</button></div></section>`;
  host.querySelectorAll('[data-legend-source]').forEach(canvas=>{
    const item=pattern.legend[Number(canvas.dataset.legendSource)],ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(item.rect){const r=item.rect,h=item.countRect?item.countRect.y+item.countRect.h-r.y:r.h;const scale=Math.min(canvas.width/r.w,canvas.height/h);ctx.drawImage(sourceCanvas,r.x,r.y,r.w,h,0,0,r.w*scale,h*scale);}else{ctx.fillStyle=item.rgb?`rgb(${item.rgb.join(',')})`:'#eee';ctx.fillRect(0,0,canvas.width,canvas.height);}
  });
  const save=document.querySelector('#saveRecognized');save.hidden=false;save.disabled=unresolved;
  save.textContent=unresolved?'先补齐图例色号和数量':unknown||mismatch?'保存待校对图纸':'确认并保存图纸';
}
function renderRecognitionPreview() {
  const host=document.querySelector('#recognitionPreview');
  if(!recognitionDraft){host.hidden=true;return;}
  const prior=host.querySelector('.draft-scroll'),position=prior?{left:prior.scrollLeft,top:prior.scrollTop}:null;
  const pattern=recognitionDraft;host.hidden=false;
  const unknown=pattern.cells.map((code,i)=>code==='?'?i:-1).filter(i=>i>=0);
  host.innerHTML=`<h3>网格预览与逐格校对</h3><p>点击格子查看原图局部并改色；红色问号表示没有足够证据确定色号。</p><div class="editor-tools"><label>高亮 <select id="draftHighlight"><option value="all">全部</option><option value="?" ${draftHighlight==='?'?'selected':''}>待校对格</option>${pattern.legend.filter(c=>c.code).map(c=>`<option value="${c.code}" ${draftHighlight===c.code?'selected':''}>${c.code}</option>`).join('')}</select></label><button id="nextDraftUnknown" class="secondary-button" ${unknown.length?'':'disabled'}>定位待校对格（${unknown.length}）</button></div><div class="pattern-scroll draft-scroll">${gridMarkup(pattern,{mode:'draft',chosen:draftHighlight,size:26})}</div><div id="draftCellDetail"></div>`;
  host.querySelector('#draftHighlight').onchange=event=>{draftHighlight=event.target.value;renderRecognitionPreview();};
  host.querySelector('#nextDraftUnknown').onclick=()=>{draftSelection=unknown.find(i=>i>(draftSelection??-1))??unknown[0];renderDraftCellDetail();host.querySelector(`[data-draftcell="${draftSelection}"]`)?.scrollIntoView({block:'nearest',inline:'center'});};
  if(position){const scroll=host.querySelector('.draft-scroll');scroll.scrollLeft=position.left;scroll.scrollTop=position.top;}
  renderDraftCellDetail();
}
function renderDraftCellDetail(){
  const host=document.querySelector('#draftCellDetail');if(!host||draftSelection===null||!recognitionDraft)return;
  const p=recognitionDraft,index=draftSelection,code=p.cells[index],row=Math.floor(index/p.width),col=index%p.width;
  host.innerHTML=`<div class="draft-cell-detail"><canvas id="draftSourceCell" width="160" height="160" aria-label="所选格的原图局部"></canvas><div><strong>第 ${row+1} 行，第 ${col+1} 列</strong><p>当前：${code==='?'?'待校对':code||'空格'}</p><label>改为 <select id="draftPaint"><option value="">空格</option>${p.legend.filter(c=>c.code).map(c=>`<option value="${c.code}" ${c.code===code?'selected':''}>${c.code}</option>`).join('')}</select></label><button id="applyDraftPaint" class="primary-button">修正这一格</button><button id="resetDraftPaint" class="text-button">恢复自动结果</button></div></div>`;
  const r=p.boardRect,cw=r.w/p.width,ch=r.h/p.height,canvas=host.querySelector('canvas'),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(sourceCanvas,r.x+col*cw,r.y+row*ch,cw,ch,0,0,160,160);
  host.querySelector('#applyDraftPaint').onclick=()=>{p.overrides={...p.overrides,[index]:host.querySelector('#draftPaint').value||null};updateRecognitionDraft();};
  host.querySelector('#resetDraftPaint').onclick=()=>{if(p.overrides)delete p.overrides[index];updateRecognitionDraft();};
}
function invalidateRecognition(){
  if(!recognitionDraft)return;
  recognitionDraft=null;recognitionSamples=null;samplingLegendIndex=null;draftSelection=null;
  document.querySelector('#recognitionAudit').hidden=true;document.querySelector('#recognitionPreview').hidden=true;document.querySelector('#saveRecognized').hidden=true;
  setRecognitionStatus('网格范围或行列数已改变，请重新识别。');
}
async function recognizeImage(allowUnequalCells=false) {
  const cols=Number(document.querySelector('#gridCols').value),rows=Number(document.querySelector('#gridRows').value);
  const board=cropRect&&{...cropRect},footer=footerRect&&{...footerRect};
  if(!sourceCanvas||!board||!footer)return setRecognitionStatus('请分别框选网格内侧和底部统计，网格不要包含坐标行列。',true);
  if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<1||rows<1||cols>160||rows>160)return setRecognitionStatus('请输入 1 到 160 之间的行列数。',true);
  const cellRatio=(board.w/cols)/(board.h/rows);
  if(allowUnequalCells!==true&&Math.abs(cellRatio-1)>.018){
    confirmDialog('请核对行列数与选区', `<p>当前为 ${cols} 列 × ${rows} 行，选区分格后宽高相差 ${Math.abs((cellRatio-1)*100).toFixed(1)}%。常见拼豆图的格子应接近正方形，行列数或选区不准会导致采样错位。</p><p>若行数 ${rows} 正确，按选区比例估计约 ${Math.round(board.w/board.h*rows)} 列（仅作参考）。请取消后核对原图坐标和辅助格线；如果原图本来就经过拉伸，可确认继续。</p>`,()=>recognizeImage(true));
    return;
  }
  const controls=['#openAlignment','#recognizePattern','#patternImage','#selectBoard','#selectLegend','#gridCols','#gridRows'];controls.forEach(id=>document.querySelector(id).disabled=true);
  recognitionDraft=null;recognitionSamples=null;samplingLegendIndex=null;draftSelection=null;draftHighlight='all';
  document.querySelector('#recognitionAudit').hidden=true;document.querySelector('#recognitionPreview').hidden=true;document.querySelector('#saveRecognized').hidden=true;
  const started=performance.now();
  try{
    setRecognitionStatus(ocrWorker?'正在准备图例识别…':'首次加载识别引擎和模型（约 22 MB），之后可使用本机缓存…');
    await getOcrWorker();
    const result=await ChartRecognitionFlow.recognize(sourcePixels(),board,rows,cols,footer,sendOcrRequest,{onProgress:setRecognitionStatus,validCode:code=>colorMap.has(code)});
    recognitionSamples=result.samples;
    recognitionDraft={id:crypto.randomUUID(),name:document.querySelector('#patternName').value.trim()||`图纸 ${state.patterns.length+1}`,width:cols,height:rows,cells:result.cells,done:{},footerCounts:result.footerCounts,legend:result.legend,boardRect:board,issues:result.issues,autoOverrides:result.autoOverrides,verificationDetails:result.verificationDetails,source:'image'};
    updateRecognitionDraft(false);
    const unknown=result.cells.filter(code=>code==='?').length;
    setRecognitionStatus(`识别用时 ${((performance.now()-started)/1000).toFixed(1)} 秒，读到 ${result.legend.length} 个图例色块。${unknown?`${unknown} 格待校对，可在预览中定位。`:'请对照底部统计和原图检查后保存。'}`);
    document.querySelector('#recognitionAudit').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){setRecognitionStatus(error.message||'识别失败，请重试。',true);}
  finally{controls.forEach(id=>document.querySelector(id).disabled=false);}
}
function renderEditor(id) {
  const pattern = state.patterns.find(item => item.id === id);
  const editor = document.querySelector('#patternEditor');
  if (!pattern) { editor.hidden = true; return; }
  editor.hidden = false;
  const counts = countPattern(pattern);
  const unknown = pattern.cells.filter(code => code === '?').length;
  const usage = inventoryUsage(pattern);
  const shortages = Object.entries(usage.counts).filter(([code, count]) => count > Number(state.stock[code] || 0));
  const options = `<option value="" ${selectedEditColor===''?'selected':''}>空格（擦除）</option>`+palette.map(({code}) => `<option value="${code}" ${code===selectedEditColor?'selected':''}>${code}</option>`).join('');
  const footerMismatch = Object.entries(pattern.footerCounts || {}).filter(([code,count]) => (counts[code] || 0) !== count).length;
  const warning = unknown ? `<p class="pattern-warning">${unknown} 个有豆格未读出色号，修正后再开始拼。</p>` : footerMismatch ? `<p class="pattern-warning">${footerMismatch} 个色号的网格统计与图纸底部统计不同，请核对。</p>` : shortages.length ? `<p class="pattern-warning">${shortages.length} 个色号库存不足。</p>` : '';
  editor.innerHTML = `<div class="editor-head"><div><h2>${esc(pattern.name)}</h2><p>${pattern.width} × ${pattern.height} 格 · ${unknown ? `${unknown} 格待校对` : shortages.length ? `${shortages.length} 色库存不足` : '库存充足'}</p></div><button class="text-button" id="closeEditor">收起</button></div>
  ${warning}
  <div class="editor-tools"><label>改色 <select id="editColor">${options}</select></label><label class="tool-group"><input id="highlightEdit" type="checkbox" ${highlightEditColor?'checked':''}>单色高亮</label><label class="tool-group">缩放 <input id="editorZoom" type="range" min="12" max="36" step="2" value="${cellSize}"><span class="zoom-value">${cellSize}px</span></label><button class="secondary-button" id="clearDone">清除进度</button></div>
  <div class="editor-actions"><button data-transform="mirrorX" class="secondary-button" title="左右镜像并另存副本">↔ 左右镜像</button><button data-transform="mirrorY" class="secondary-button" title="上下镜像并另存副本">↕ 上下镜像</button><button data-transform="rotate" class="secondary-button" title="顺时针旋转 90° 并另存副本">⟳ 旋转90°</button><button id="exportPattern" class="secondary-button" title="导出图纸为 PNG 图片">⇩ 导出图片</button></div>
  <div class="pattern-color-list"><details open><summary>扣减用量与库存（${usage.fromFooter?'底部统计':'网格统计'}）</summary>${Object.entries(usage.counts).sort((a,b)=>a[0].localeCompare(b[0])).map(([code,count]) => `<div class="pattern-color-row ${highlightEditColor&&selectedEditColor===code?'active':''}"><i class="color-swatch" style="height:16px;width:20px;margin:0;background:${colorMap.get(code).color}"></i><button data-focus-color="${code}">${code} · 需要 ${count} 颗 · 库存 ${fmt(state.stock[code])}</button><strong class="color-count" style="color:${count>Number(state.stock[code]||0)?'var(--red)':'var(--green)'}">${count>Number(state.stock[code]||0)?`缺 ${count-Number(state.stock[code]||0)}`:'够用'}</strong></div>`).join('')}</details></div>
  <div class="pattern-scroll" style="margin-top:14px">${gridMarkup(pattern, { mode: 'edit', highlight: highlightEditColor })}</div>`;
  editor.querySelector('#closeEditor').onclick = () => { editor.hidden = true; editPatternId = null; };
  editor.querySelector('#clearDone').onclick = () => { pattern.done = {}; persist(); renderEditor(id); renderPatterns(); };
}
function transformPattern(pattern, transform) {
  const matrix = Array.from({ length: pattern.height }, (_, row) => pattern.cells.slice(row * pattern.width, (row + 1) * pattern.width));
  let next;
  if (transform === 'mirrorX') next = matrix.map(row => [...row].reverse());
  if (transform === 'mirrorY') next = [...matrix].reverse();
  if (transform === 'rotate') next = Array.from({ length: pattern.width }, (_, row) => Array.from({ length: pattern.height }, (_, col) => matrix[pattern.height - 1 - col][row]));
  const width = transform === 'rotate' ? pattern.height : pattern.width;
  const height = transform === 'rotate' ? pattern.width : pattern.height;
  const suffix = { mirrorX: '左右镜像', mirrorY: '上下镜像', rotate: '旋转90°' }[transform];
  const copy = { ...pattern, id: crypto.randomUUID(), name: `${pattern.name}（${suffix}）`, width, height, cells: next.flat(), done: {}, consumed: false };
  state.patterns.unshift(copy); state.activePattern = copy.id; persist();
  editPatternId = copy.id; renderPatterns(); renderEditor(copy.id);
}
function exportPatternImage(pattern) {
  const size = 24; const margin = 40;
  const canvas = document.createElement('canvas');
  canvas.width = pattern.width * size + margin; canvas.height = pattern.height * size + margin;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  pattern.cells.forEach((code,index) => {
    const x = margin + index % pattern.width * size; const y = margin + Math.floor(index / pattern.width) * size;
    ctx.fillStyle = patternColor(pattern,code); ctx.fillRect(x,y,size,size);
    ctx.strokeStyle = '#68716d'; ctx.lineWidth = 0.5; ctx.strokeRect(x,y,size,size);
    ctx.fillStyle = patternTextColor(pattern,code); if (size >= 22 && code != null) ctx.fillText(code,x+size/2,y+size/2);
  });
  ctx.fillStyle = '#202725'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${pattern.name} · ${pattern.width} × ${pattern.height}`, 3, 15);
  const link = document.createElement('a'); link.download = `${pattern.name}.png`; link.href = canvas.toDataURL('image/png'); link.click();
}
function renderWork() {
  const pattern = state.patterns.find(item => item.id === state.activePattern) || state.patterns[0];
  const empty = document.querySelector('#workEmpty');
  const host = document.querySelector('#workArea');
  if (!pattern) { empty.hidden = false; host.hidden = true; return; }
  state.activePattern = pattern.id;
  empty.hidden = true; host.hidden = false;
  const counts = countPattern(pattern);
  const colors = Object.keys(counts).sort((a,b)=>a.localeCompare(b));
  const total = pattern.cells.filter(code=>colorMap.has(code)).length;
  const complete = Object.values(pattern.done || {}).filter(Boolean).length;
  if(currentWorkColor!=='all'&&!counts[currentWorkColor])currentWorkColor='all';
  const chosen = currentWorkColor;
  const view=pattern.workView||{};
  const unknown = pattern.cells.filter(code => code === '?').length;
  const usage = inventoryUsage(pattern);
  const insufficient = Object.entries(usage.counts).some(([code,count]) => count > Number(state.stock[code] || 0));
  const mismatch=Object.entries(pattern.footerCounts||{}).some(([code,count])=>(counts[code]||0)!==count);
  const finishLabel = pattern.consumed ? '库存已扣减' : usage.blocked ? '先校对扣减用量' : insufficient ? '库存不足，先调整' : usage.fromFooter ? '完成并按底部统计扣库存' : '完成并扣库存';
  const activeCount = chosen === 'all' ? total : counts[chosen] || 0;
  const activeDone = chosen === 'all' ? complete : Object.entries(pattern.done || {}).filter(([index,done]) => done && pattern.cells[Number(index)] === chosen).length;
  host.innerHTML = `<div class="work-summary"><h2>${esc(pattern.name)}</h2><select id="workPattern">${state.patterns.map(p=>`<option value="${p.id}" ${p.id===pattern.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>${unknown ? `<p class="pattern-warning">${unknown} 个格子待校对，仍可对照原图修正。</p>` : ''}<p class="notice">库存扣减依据：${usage.fromFooter?'底部统计':'网格统计'}，共 ${fmt(usage.total)} 颗。${usage.fromFooter&&(unknown||mismatch)?'网格存在差异，不影响按底部统计扣减。':''}</p><div class="work-stats"><span>已完成 <strong>${complete}</strong> / ${total}</span><span>${Math.round(complete/Math.max(total,1)*100)}%</span><button class="text-button" id="finishWork" ${pattern.consumed||insufficient||usage.blocked?'disabled':''}>${finishLabel}</button></div><div class="work-color-summary"><i class="color-swatch" style="height:20px;width:26px;margin:0;background:${chosen==='all'?'#e2f1ea':colorMap.get(chosen)?.color}"></i><span>${chosen==='all'?'全部色号':`当前色号 ${chosen}`}</span><strong>${activeDone} / ${activeCount}</strong><span>已拼</span></div><div class="work-view-tools"><label><input id="workHighlight" type="checkbox" ${view.highlight!==false?'checked':''}>单色高亮</label><button id="workMirrorX" class="secondary-button" aria-pressed="${!!view.mirrorX}">↔ 左右镜像</button><button id="workMirrorY" class="secondary-button" aria-pressed="${!!view.mirrorY}">↕ 上下镜像</button><button id="workResetView" class="text-button">恢复原方向</button><span>镜像只改变观看方向，进度仍对应原格子。</span></div><div class="editor-tools"><label>当前色号 <select id="workColor"><option value="all">显示全部</option>${colors.map(code=>`<option value="${code}" ${chosen===code?'selected':''}>${code} · ${counts[code]} 颗 · 库存 ${fmt(state.stock[code])}</option>`).join('')}</select></label><button class="secondary-button" id="nextCell">标记下一个${chosen==='all'?'':' '+chosen}格</button><label class="tool-group">缩放 <input id="workZoom" type="range" min="12" max="36" step="2" value="${cellSize}"><span class="zoom-value">${cellSize}px</span></label></div><div class="pattern-scroll">${gridMarkup(pattern, { mode: 'work', chosen })}</div>`;
  host.querySelector('#workPattern').onchange = e => { state.activePattern = e.target.value; currentWorkColor = 'all'; persist(); renderWork(); };
  for(const [id,key] of [['workMirrorX','mirrorX'],['workMirrorY','mirrorY']])host.querySelector('#'+id).onclick=()=>{pattern.workView={...pattern.workView,[key]:!pattern.workView?.[key]};persist();renderWork();};
  host.querySelector('#workHighlight').onchange=e=>{pattern.workView={...pattern.workView,highlight:e.target.checked};persist();renderWork();};
  host.querySelector('#workResetView').onclick=()=>{pattern.workView={...pattern.workView,mirrorX:false,mirrorY:false};persist();renderWork();};
  host.querySelector('#workColor').onchange = e => { currentWorkColor = e.target.value; renderWork(); };
  host.querySelector('#nextCell').onclick = () => { const idx=Array.from(host.querySelectorAll('[data-workcell]'),cell=>Number(cell.dataset.workcell)).find(i=>colorMap.has(pattern.cells[i])&&(chosen==='all'||pattern.cells[i]===chosen)&&!pattern.done?.[i])??-1; if(idx>=0){pattern.done={...pattern.done,[idx]:true};persist();renderWork();} };
  if(!pattern.consumed&&!insufficient&&!usage.blocked) host.querySelector('#finishWork').onclick = () => confirmDialog('完成图纸并扣减库存', `<p class="notice">将按${usage.fromFooter?'底部统计':'网格统计'}扣减 ${fmt(usage.total)} 颗，请确认以下用量。此操作只能执行一次。</p><ul>${Object.entries(usage.counts).map(([code,count])=>`<li>${code}：${fmt(count)} 颗</li>`).join('')}</ul>`, () => {
    const current = inventoryUsage(pattern);
    if(pattern.consumed || current.blocked || Object.entries(current.counts).some(([code,count])=>count>Number(state.stock[code]||0))){renderWork();return;}
    Object.entries(current.counts).forEach(([code,count])=>state.stock[code]=Number(state.stock[code]||0)-count);
    pattern.consumed=true;pattern.consumption={source:current.fromFooter?'footer':'grid',counts:{...current.counts},at:new Date().toISOString()};
    persist();renderWork();renderInventory();renderPatterns();
  });
}
function confirmDialog(title, content, action) {
  const dialog = document.querySelector('#confirmDialog');
  document.querySelector('#dialogTitle').textContent = title;
  document.querySelector('#dialogContent').innerHTML = content;
  const confirm = document.querySelector('#dialogConfirm');
  confirm.onclick = event => { event.preventDefault(); dialog.close(); action(); };
  dialog.showModal();
}
document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(button => button.onclick = () => showView(button.dataset.goto));
document.querySelector('#colorSearch').addEventListener('input', renderInventory);
document.querySelector('#inventoryFilter').addEventListener('change', renderInventory);
document.querySelector('#importPattern').onclick = importGrid;
document.querySelector('#newPattern').onclick = () => { document.querySelector('#patternImage').click(); window.scrollTo({top:document.querySelector('#importPanel').offsetTop,behavior:'smooth'}); };
document.querySelector('#inventoryGrid').addEventListener('click', event => {
  const button=event.target.closest('[data-stock]'); if(!button)return;
  const code=button.closest('.color-item').dataset.code;
  const n=Number(button.dataset.stock); state.stock[code]=Math.max(0,Number(state.stock[code]||0)+n); persist(); renderInventory();
});
document.querySelector('#inventoryGrid').addEventListener('change', event => {
  const input=event.target.closest('input[type=number]'); if(!input)return;
  const code=input.closest('.color-item').dataset.code; state.stock[code]=Math.max(0,Math.floor(Number(input.value)||0));persist();renderInventory();
});
document.querySelector('#adjustAll').onclick = () => confirmDialog('批量设置库存', '<label class="dialog-field">每个色号设置为<input id="bulkQuantity" type="number" min="0" value="1000"></label><p class="notice">将覆盖所有 221 个色号当前的库存数量。</p>', () => { const value=Math.max(0,Math.floor(Number(document.querySelector('#bulkQuantity')?.value)||0)); palette.forEach(({code})=>state.stock[code]=value);persist();renderInventory(); });
document.querySelector('#patternList').addEventListener('click', event => {
  const button=event.target.closest('[data-pattern]'); if(!button)return;
  const pattern=state.patterns.find(p=>p.id===button.dataset.id); if(!pattern)return;
  if(button.dataset.pattern==='edit'){editPatternId=pattern.id;renderEditor(pattern.id);document.querySelector('#patternEditor').scrollIntoView({behavior:'smooth'});}
  if(button.dataset.pattern==='work'){state.activePattern=pattern.id;persist();showView('work');}
  if(button.dataset.pattern==='delete')confirmDialog('删除这张图纸？','<p class="notice">删除后无法恢复。库存不会因此改变。</p>',()=>{state.patterns=state.patterns.filter(p=>p.id!==pattern.id);if(state.activePattern===pattern.id)state.activePattern=null;persist();renderPatterns();});
});
document.querySelector('#workArea').addEventListener('click', event => {
  const cell=event.target.closest('[data-workcell]'); if(!cell||cell.classList.contains('dim'))return;
  const pattern=state.patterns.find(p=>p.id===state.activePattern);if(!pattern)return;
  const i=Number(cell.dataset.workcell);if(!colorMap.has(pattern.cells[i]))return;pattern.done={...pattern.done,[i]:!pattern.done?.[i]};persist();renderWork();
});
document.querySelector('#patternImage').addEventListener('change', event => loadImageFile(event.target.files?.[0]));
document.querySelector('#recognizePattern').onclick = recognizeImage;

document.querySelector('#recognitionPreview').addEventListener('click',event=>{const cell=event.target.closest('[data-draftcell]');if(cell){draftSelection=Number(cell.dataset.draftcell);renderDraftCellDetail();}});
document.querySelector('#recognitionAudit').addEventListener('click',event=>{
  if(!recognitionDraft)return;
  const sample=event.target.closest('[data-sample-index]');
  if(sample){const i=Number(sample.dataset.sampleIndex);samplingLegendIndex=samplingLegendIndex===i?null:i;renderRecognitionAudit(recognitionDraft);if(samplingLegendIndex!==null){document.querySelector('#cropHelp').textContent=`点击 ${recognitionDraft.legend[i].code||'对应色号'} 的纯色底色，避开文字`;setRecognitionStatus('点击原图色块的空白部分取样；再次点击“取消取色”退出。');document.querySelector('#imageStage').scrollIntoView({behavior:'smooth',block:'center'});}return;}
  const remove=event.target.closest('[data-remove-legend]');if(remove){recognitionDraft.legend.splice(Number(remove.dataset.removeLegend),1);samplingLegendIndex=null;updateRecognitionDraft();return;}
  if(event.target.id==='addLegend'){const code=document.querySelector('#addLegendCode')?.value;if(code){recognitionDraft.legend.push({code,count:null,rgb:null});updateRecognitionDraft();}}
});
document.querySelector('#recognitionAudit').addEventListener('change',event=>{
  const row=event.target.closest('[data-legend-index]');if(!row||!recognitionDraft)return;
  const entry=recognitionDraft.legend[Number(row.dataset.legendIndex)];if(!entry)return;
  if(event.target.matches('[data-legend-code]')){if(event.target.value&&recognitionDraft.legend.some(item=>item!==entry&&item.code===event.target.value)){setRecognitionStatus('这个色号已经存在，请先检查是否重复识别。',true);renderRecognitionAudit(recognitionDraft);return;}entry.code=event.target.value||null;samplingLegendIndex=null;}
  if(event.target.matches('[data-legend-count]'))entry.count=event.target.value===''?null:Math.max(0,Math.floor(Number(event.target.value)||0));
  updateRecognitionDraft();
});
document.querySelector('#saveRecognized').onclick = () => {
  if (!recognitionDraft || document.querySelector('#saveRecognized').disabled) return;
  const pattern = recognitionDraft;
  state.patterns.unshift(pattern); state.activePattern = pattern.id; persist();
  recognitionDraft = null; recognitionSamples = null; samplingLegendIndex = null; document.querySelector('#recognitionAudit').hidden = true; document.querySelector('#recognitionPreview').hidden = true; editPatternId = pattern.id; renderPatterns(); renderEditor(pattern.id);
  document.querySelector('#saveRecognized').hidden = true;
  document.querySelector('#recognitionStatus').hidden = true;
  setRecognitionStatus('图纸已保存。可在网格中校对，或进入拼制模式。');
};
const imageCanvas = document.querySelector('#imageCanvas');
function canvasPoint(event) {
  const rect = imageCanvas.getBoundingClientRect();
  return { x: Math.round((event.clientX - rect.left) * imageCanvas.width / rect.width), y: Math.round((event.clientY - rect.top) * imageCanvas.height / rect.height) };
}
function updateCrop(point) {
  const rect={x:Math.min(cropDrag.x,point.x),y:Math.min(cropDrag.y,point.y),w:Math.abs(point.x-cropDrag.x),h:Math.abs(point.y-cropDrag.y)};
  if(selectionMode==='board')cropRect=rect;else footerRect=rect;
  drawImageCanvas();
}

imageCanvas.addEventListener('pointerdown',event=>{
  if(!sourceImage||document.querySelector('#recognizePattern').disabled)return;
  const point=canvasPoint(event);
  pointerStart={x:event.clientX,y:event.clientY};
  if(document.querySelector('#cropMethod').value==='tap')return;
  if(samplingLegendIndex!==null&&recognitionDraft){
    const entry=recognitionDraft.legend[samplingLegendIndex];if(entry){entry.rgb=ChartRecognizer.dominant(ChartRecognizer.pixels(sourcePixels(),{x:point.x-2,y:point.y-2,w:5,h:5}));samplingLegendIndex=null;updateRecognitionDraft();setRecognitionStatus('色块样本已更新，网格已重新匹配。');}return;
  }
  invalidateRecognition();imageCanvas.setPointerCapture(event.pointerId);cropDrag=point;updateCrop(cropDrag);
});
imageCanvas.addEventListener('pointermove', event => { if (cropDrag) updateCrop(canvasPoint(event)); });
imageCanvas.addEventListener('pointerup',event=>{
  if(!sourceImage||document.querySelector('#recognizePattern').disabled)return;
  const point=canvasPoint(event);
  if(document.querySelector('#cropMethod').value==='tap'){
    if(!pointerStart||Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>8)return;
    pointerStart=null;
    if(samplingLegendIndex!==null&&recognitionDraft){const entry=recognitionDraft.legend[samplingLegendIndex];if(entry){entry.rgb=ChartRecognizer.dominant(ChartRecognizer.pixels(sourcePixels(),{x:point.x-2,y:point.y-2,w:5,h:5}));samplingLegendIndex=null;updateRecognitionDraft();setRecognitionStatus('色块样本已更新。');}return;}
    if(!cropTapAnchor){invalidateRecognition();cropTapAnchor=point;document.querySelector('#cropHelp').textContent='已标记第一个角。可滚动图片，再点另一个角。';drawImageCanvas();return;}
    cropDrag=cropTapAnchor;cropTapAnchor=null;
  }
  if(!cropDrag)return;
  updateCrop(point);const rect=selectionMode==='board'?cropRect:footerRect;cropDrag=null;
  if(rect.w<20||rect.h<20){if(selectionMode==='board')cropRect=null;else footerRect=null;setRecognitionStatus('选区太小，请重新选择两个角。',true);}
  document.querySelector('#cropHelp').textContent='选区已标记，请核对范围和分格辅助线。';drawImageCanvas();
});
document.querySelector('#selectBoard').onclick = () => { samplingLegendIndex=null;cropTapAnchor=null;selectionMode='board';document.querySelector('#selectBoard').classList.add('selected');document.querySelector('#selectLegend').classList.remove('selected');document.querySelector('#cropHelp').textContent='框选图纸的网格区域，尽量贴合最外侧格线';drawImageCanvas(); };
document.querySelector('#selectLegend').onclick = () => { samplingLegendIndex=null;cropTapAnchor=null;selectionMode='legend';document.querySelector('#selectLegend').classList.add('selected');document.querySelector('#selectBoard').classList.remove('selected');document.querySelector('#cropHelp').textContent='框选底部色号和数量色块，不要包含网格坐标';drawImageCanvas(); };
document.querySelector('#exportData').onclick = () => {
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='豆豆工坊-备份.json';a.click();URL.revokeObjectURL(url);
};
document.querySelector('#importData').onclick = () => document.querySelector('#backupInput').click();
document.querySelector('#backupInput').onchange = async e => { try {const data=JSON.parse(await e.target.files[0].text());if(data.version!==1||!data.stock||!Array.isArray(data.patterns))throw Error();state=data;persist();renderInventory();renderPatterns();alert('备份已恢复');}catch{alert('备份文件格式无效');} };
document.querySelector('#patternEditor').addEventListener('click', event => {
  const transform=event.target.closest('[data-transform]');
  if(transform){const pattern=state.patterns.find(item=>item.id===editPatternId);if(pattern)transformPattern(pattern,transform.dataset.transform);return;}
  if(event.target.closest('#exportPattern')){const pattern=state.patterns.find(item=>item.id===editPatternId);if(pattern)exportPatternImage(pattern);return;}
  const focus=event.target.closest('[data-focus-color]');
  if(focus){selectedEditColor=focus.dataset.focusColor;highlightEditColor=true;renderEditor(editPatternId);return;}
  const cell=event.target.closest('[data-cell]');
  if(cell){const pattern=state.patterns.find(item=>item.id===editPatternId);if(!pattern)return;const index=Number(cell.dataset.cell);pattern.cells[index]=selectedEditColor||null;persist();renderEditor(editPatternId);renderPatterns();}
});
document.querySelector('#patternEditor').addEventListener('change', event => {
  if(event.target.id==='editColor'){selectedEditColor=event.target.value;renderEditor(editPatternId);}
  if(event.target.id==='highlightEdit'){highlightEditColor=event.target.checked;renderEditor(editPatternId);}
  if(event.target.id==='editorZoom'){cellSize=Number(event.target.value);renderEditor(editPatternId);}
});
document.querySelector('#patternEditor').addEventListener('input', event => {
  if(event.target.id!=='editorZoom')return;
  cellSize=Number(event.target.value);
  const canvas=document.querySelector('#patternEditor .pattern-canvas');canvas.style.setProperty('--cell-size',`${cellSize}px`);canvas.style.gridTemplateColumns=`30px repeat(${state.patterns.find(item=>item.id===editPatternId).width}, ${cellSize}px)`;
  canvas.querySelectorAll('.pattern-cell').forEach(cell=>{cell.style.width=`${cellSize}px`;cell.style.height=`${cellSize}px`;cell.textContent=cellSize>=24?cell.title.split(' · ').pop().replace('空格',''):'';});
  event.target.nextElementSibling.textContent=`${cellSize}px`;
});
document.querySelector('#workArea').addEventListener('input', event => {
  if(event.target.id!=='workZoom')return;
  cellSize=Number(event.target.value);
  const canvas=document.querySelector('#workArea .pattern-canvas');const pattern=state.patterns.find(item=>item.id===state.activePattern);
  canvas.style.setProperty('--cell-size',`${cellSize}px`);canvas.style.gridTemplateColumns=`30px repeat(${pattern.width}, ${cellSize}px)`;
  canvas.querySelectorAll('.pattern-cell').forEach(cell=>{cell.style.width=`${cellSize}px`;cell.style.height=`${cellSize}px`;cell.textContent=cell.title.split(' · ').pop().replace('空格','');});
  event.target.nextElementSibling.textContent=`${cellSize}px`;
});
document.querySelector('#gridOverlay').onchange=drawImageCanvas;
document.querySelector('#imageZoom').oninput=event=>{imageCanvas.style.width=`${Number(event.target.value)*100}%`;};
document.querySelector('#cropMethod').onchange=event=>{cropTapAnchor=null;cropDrag=null;imageCanvas.style.touchAction=event.target.value==='tap'?'pan-x pan-y':'none';document.querySelector('#cropHelp').textContent=event.target.value==='tap'?'先点左上角，滚动图片后再点右下角':'拖动框选目标区域';drawImageCanvas();};
for(const id of ['#gridCols','#gridRows'])document.querySelector(id).addEventListener('change',()=>{invalidateRecognition();drawImageCanvas();});
imageCanvas.addEventListener('pointercancel',()=>{cropDrag=null;pointerStart=null;});
renderInventory();renderPatterns();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
