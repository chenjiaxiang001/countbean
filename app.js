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
let cropDrag = null;
let recognitionDraft = null;

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
function gridMarkup(pattern, { mode = 'edit', chosen = 'all', size = cellSize, highlight = false } = {}) {
  const parts = ['<span class="coordinate-label corner">·</span>'];
  for (let col = 1; col <= pattern.width; col++) parts.push(`<span class="coordinate-label">${col}</span>`);
  for (let row = 0; row < pattern.height; row++) {
    parts.push(`<span class="coordinate-label row-label">${row + 1}</span>`);
    for (let col = 0; col < pattern.width; col++) {
      const index = row * pattern.width + col; const code = pattern.cells[index];
      const dim = mode === 'work' ? chosen !== 'all' && code !== chosen : highlight && selectedEditColor !== code;
      const done = mode === 'work' && pattern.done?.[index];
      const key = mode === 'work' ? 'workcell' : 'cell';
      const color = colorMap.get(code)?.color || (code === '?' ? '#f5d1cc' : '#fff');
      const label = code === '?' ? '?' : code || '';
      parts.push(`<button class="pattern-cell ${code === '?' ? 'unknown' : ''} ${dim ? 'dim' : ''} ${done ? 'done' : ''}" data-${key}="${index}" title="第 ${row + 1} 行 · 第 ${col + 1} 列 · ${code === '?' ? '待校对' : code || '空格'}" style="background:${color}">${size >= 24 ? esc(label) : ''}</button>`);
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
  ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  if (cropRect) {
    ctx.fillStyle = '#10221c77';
    ctx.fillRect(0, 0, canvas.width, cropRect.y);
    ctx.fillRect(0, cropRect.y + cropRect.h, canvas.width, canvas.height - cropRect.y - cropRect.h);
    ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.h);
    ctx.fillRect(cropRect.x + cropRect.w, cropRect.y, canvas.width - cropRect.x - cropRect.w, cropRect.h);
    ctx.strokeStyle = '#ffed8b'; ctx.lineWidth = Math.max(3, canvas.width / 500);
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
  }
}
function loadImageFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.querySelector('#imageCanvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    sourceImage = image; cropRect = null; recognitionDraft = null;
    document.querySelector('#imageStage').hidden = false;
    document.querySelector('#recognitionFields').hidden = false;
    document.querySelector('#recognitionStatus').hidden = true;
    document.querySelector('#recognitionAudit').hidden = true;
    document.querySelector('#saveRecognized').hidden = true;
    document.querySelector('#patternName').value = file.name.replace(/\.[^.]+$/, '');
    drawImageCanvas(); URL.revokeObjectURL(url);
  };
  image.onerror = () => { URL.revokeObjectURL(url); setRecognitionStatus('图片无法读取，请换一张 PNG 或 JPG。', true); };
  image.src = url;
}
async function getOcrWorker(onProgress) {
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = resolve; script.onerror = () => reject(new Error('OCR 组件加载失败，请检查网络后重试。'));
      document.head.append(script);
    });
  }
  const worker = await window.Tesseract.createWorker('eng', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
    logger: item => { if (item.status === 'recognizing text') onProgress(Math.round(item.progress * 100)); }
  });
  await worker.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' });
  return worker;
}
function makeOcrCanvas(rect, rows, cols) {
  const scale = Math.min(4, Math.max(2, 1800 / Math.max(rect.w, rect.h)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(rect.w * scale); canvas.height = Math.round(rect.h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(document.querySelector('#imageCanvas'), rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
  const cellW = canvas.width / cols; const cellH = canvas.height / rows;
  ctx.fillStyle = '#fff';
  const line = Math.max(3, Math.round(scale * 2));
  for (let x = 0; x <= cols; x++) ctx.fillRect(Math.round(x * cellW - line / 2), 0, line, canvas.height);
  for (let y = 0; y <= rows; y++) ctx.fillRect(0, Math.round(y * cellH - line / 2), canvas.width, line);
  return { canvas, scale, cellW, cellH };
}
function occupiedCells(rect, rows, cols) {
  const source = document.querySelector('#imageCanvas');
  const ctx = source.getContext('2d', { willReadFrequently: true });
  const cells = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = rect.x + col * rect.w / cols; const y = rect.y + row * rect.h / rows;
    const insetX = rect.w / cols * 0.2; const insetY = rect.h / rows * 0.2;
    const w = Math.max(1, Math.floor(rect.w / cols * 0.6)); const h = Math.max(1, Math.floor(rect.h / rows * 0.6));
    const pixels = ctx.getImageData(Math.floor(x + insetX), Math.floor(y + insetY), Math.min(w, source.width - Math.floor(x + insetX)), Math.min(h, source.height - Math.floor(y + insetY))).data;
    let foreground = 0; let sampled = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const r=pixels[i], g=pixels[i+1], b=pixels[i+2];
      const light=(r*299+g*587+b*114)/1000; const saturation=Math.max(r,g,b)-Math.min(r,g,b);
      if (light < 205 || saturation > 24 && light < 250) foreground++;
      sampled++;
    }
    cells.push(foreground / Math.max(1, sampled) > 0.018);
  }
  return cells;
}
function parseFooterCounts(words, rect, imageHeight) {
  const footer = words.filter(word => word.bbox.y0 > rect.y + rect.h + imageHeight * 0.012 && word.confidence > 20);
  const codes = footer.map(word => ({ word, code: word.text.toUpperCase().replace(/[^A-Z0-9]/g, '') })).filter(item => colorMap.has(item.code));
  const numbers = footer.map(word => ({ word, value: word.text.replace(/[^0-9]/g, '') })).filter(item => /^\d{1,5}$/.test(item.value));
  const counts = {};
  for (const item of codes) {
    const x = (item.word.bbox.x0 + item.word.bbox.x1) / 2;
    const y = (item.word.bbox.y0 + item.word.bbox.y1) / 2;
    const nearest = numbers.map(number => {
      const nx = (number.word.bbox.x0 + number.word.bbox.x1) / 2;
      const ny = (number.word.bbox.y0 + number.word.bbox.y1) / 2;
      return { number, distance: Math.abs(nx - x) + Math.abs(ny - y) * 1.5, dx: Math.abs(nx - x), dy: ny - y };
    }).filter(candidate => candidate.dx < 180 && candidate.dy > -8 && candidate.dy < 100).sort((a,b) => a.distance - b.distance)[0];
    if (nearest && counts[item.code] === undefined) counts[item.code] = Number(nearest.number.value);
  }
  return counts;
}
function renderRecognitionAudit(pattern) {
  const host = document.querySelector('#recognitionAudit');
  const cellCounts = countPattern(pattern);
  const footerCounts = pattern.footerCounts || {};
  const codes = [...new Set([...Object.keys(cellCounts), ...Object.keys(footerCounts)])].sort((a,b)=>a.localeCompare(b));
  host.hidden = false;
  const recognized = pattern.cells.filter(code => colorMap.has(code)).length;
  const occupied = pattern.cells.filter(code => code !== null).length;
  const discrepancies = codes.filter(code => footerCounts[code] !== undefined && (cellCounts[code] || 0) !== footerCounts[code]);
  host.innerHTML = `<strong>读出 ${recognized}/${occupied} 个有豆格，${pattern.cells.length-occupied} 个空格</strong>${Object.keys(footerCounts).length ? `<span> · 底部统计已读 ${Object.keys(footerCounts).length} 色</span>` : '<span> · 未读到底部统计，可按网格结果继续校对</span>'}${discrepancies.length ? `<span class="audit-chip mismatch">${discrepancies.length} 色数量不一致，请检查</span>` : ''}${codes.map(code => `<span class="audit-chip ${footerCounts[code] !== undefined && (cellCounts[code] || 0) !== footerCounts[code] ? 'mismatch' : ''}">${code} ${cellCounts[code] || 0}${footerCounts[code] !== undefined ? ` / ${footerCounts[code]}` : ''}</span>`).join('')}`;
}
async function recognizeImage() {
  const cols = Number(document.querySelector('#gridCols').value);
  const rows = Number(document.querySelector('#gridRows').value);
  if (!sourceImage || !cropRect) return setRecognitionStatus('请先上传图片，再拖动框选图纸网格区域。', true);
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > 160 || rows > 160) return setRecognitionStatus('请输入有效的行数和列数（1 到 160）。', true);
  if (cropRect.w / cols < 8 || cropRect.h / rows < 8) return setRecognitionStatus('选中的网格区域太小，请放大图片或重新框选。', true);
  const status = document.querySelector('#recognitionStatus');
  const recognizeButton = document.querySelector('#recognizePattern');
  recognizeButton.disabled = true;
  status.hidden = false; status.classList.remove('error'); status.innerHTML = '正在加载本地 OCR 引擎…<progress max="100" value="0"></progress>';
  let worker;
  try {
    worker = await getOcrWorker(value => { const bar=document.querySelector('#recognitionStatus progress');if(bar)bar.value=value; });
    const { canvas, scale, cellW, cellH } = makeOcrCanvas(cropRect, rows, cols);
    status.innerHTML = '正在逐格识别色号…<progress max="100" value="0"></progress>';
    const boardResult = await worker.recognize(canvas);
    const occupied = occupiedCells(cropRect, rows, cols);
    const cells = occupied.map(value => value ? '?' : null);
    for (const word of boardResult.data.words || []) {
      const code = word.text.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!colorMap.has(code) || word.confidence < 18) continue;
      const x = (word.bbox.x0 + word.bbox.x1) / 2;
      const y = (word.bbox.y0 + word.bbox.y1) / 2;
      const col = Math.floor(x / cellW); const row = Math.floor(y / cellH);
      if (row >= 0 && row < rows && col >= 0 && col < cols) cells[row * cols + col] = code;
    }
    const wholeResult = await worker.recognize(document.querySelector('#imageCanvas'));
    const footerCounts = parseFooterCounts(wholeResult.data.words || [], cropRect, document.querySelector('#imageCanvas').height);
    recognitionDraft = { id: crypto.randomUUID(), name: document.querySelector('#patternName').value.trim() || `图纸 ${state.patterns.length + 1}`, width: cols, height: rows, cells, done: {}, footerCounts, source: 'image' };
    renderRecognitionAudit(recognitionDraft);
    document.querySelector('#saveRecognized').hidden = false;
    setRecognitionStatus('识别完成。红色空格没有读到有效色号，可在网格编辑中选色修正。');
    document.querySelector('#recognitionAudit').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    setRecognitionStatus(error.message || '识别失败，请重新选择图片或稍后重试。', true);
  } finally { if (worker) await worker.terminate(); recognizeButton.disabled = false; }
}
function renderEditor(id) {
  const pattern = state.patterns.find(item => item.id === id);
  const editor = document.querySelector('#patternEditor');
  if (!pattern) { editor.hidden = true; return; }
  editor.hidden = false;
  const counts = countPattern(pattern);
  const unknown = pattern.cells.filter(code => code === '?').length;
  const shortages = Object.entries(counts).filter(([code, count]) => count > Number(state.stock[code] || 0));
  const options = palette.map(({code}) => `<option value="${code}" ${code===selectedEditColor?'selected':''}>${code}</option>`).join('');
  const footerMismatch = Object.entries(pattern.footerCounts || {}).filter(([code,count]) => (counts[code] || 0) !== count).length;
  const warning = unknown ? `<p class="pattern-warning">${unknown} 个有豆格未读出色号，修正后再开始拼。</p>` : footerMismatch ? `<p class="pattern-warning">${footerMismatch} 个色号的网格统计与图纸底部统计不同，请核对。</p>` : shortages.length ? `<p class="pattern-warning">${shortages.length} 个色号库存不足。</p>` : '';
  editor.innerHTML = `<div class="editor-head"><div><h2>${esc(pattern.name)}</h2><p>${pattern.width} × ${pattern.height} 格 · ${unknown ? `${unknown} 格待校对` : shortages.length ? `${shortages.length} 色库存不足` : '库存充足'}</p></div><button class="text-button" id="closeEditor">收起</button></div>
  ${warning}
  <div class="editor-tools"><label>改色 <select id="editColor">${options}</select></label><label class="tool-group"><input id="highlightEdit" type="checkbox" ${highlightEditColor?'checked':''}>单色高亮</label><label class="tool-group">缩放 <input id="editorZoom" type="range" min="12" max="36" step="2" value="${cellSize}"><span class="zoom-value">${cellSize}px</span></label><button class="secondary-button" id="clearDone">清除进度</button></div>
  <div class="editor-actions"><button data-transform="mirrorX" class="secondary-button" title="左右镜像并另存副本">↔ 左右镜像</button><button data-transform="mirrorY" class="secondary-button" title="上下镜像并另存副本">↕ 上下镜像</button><button data-transform="rotate" class="secondary-button" title="顺时针旋转 90° 并另存副本">⟳ 旋转90°</button><button id="exportPattern" class="secondary-button" title="导出图纸为 PNG 图片">⇩ 导出图片</button></div>
  <div class="pattern-color-list"><details open><summary>色号统计与库存</summary>${Object.entries(counts).sort((a,b)=>a[0].localeCompare(b[0])).map(([code,count]) => `<div class="pattern-color-row ${highlightEditColor&&selectedEditColor===code?'active':''}"><i class="color-swatch" style="height:16px;width:20px;margin:0;background:${colorMap.get(code).color}"></i><button data-focus-color="${code}">${code} · 需要 ${count} 颗 · 库存 ${fmt(state.stock[code])}</button><strong class="color-count" style="color:${count>Number(state.stock[code]||0)?'var(--red)':'var(--green)'}">${count>Number(state.stock[code]||0)?`缺 ${count-Number(state.stock[code]||0)}`:'够用'}</strong></div>`).join('')}</details></div>
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
    ctx.fillStyle = colorMap.get(code)?.color || (code === '?' ? '#f1d4cd' : '#fff'); ctx.fillRect(x,y,size,size);
    ctx.strokeStyle = '#68716d'; ctx.lineWidth = 0.5; ctx.strokeRect(x,y,size,size);
    ctx.fillStyle = '#18211d'; if (size >= 22) ctx.fillText(code,x+size/2,y+size/2);
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
  const chosen = currentWorkColor === 'all' ? 'all' : currentWorkColor;
  const unknown = pattern.cells.filter(code => code === '?').length;
  const insufficient = Object.entries(counts).some(([code,count]) => count > Number(state.stock[code] || 0));
  const finishLabel = pattern.consumed ? '库存已扣减' : unknown ? '先修正未识别格' : insufficient ? '库存不足，先调整' : '完成并扣库存';
  const activeCount = chosen === 'all' ? total : counts[chosen] || 0;
  const activeDone = chosen === 'all' ? complete : Object.entries(pattern.done || {}).filter(([index,done]) => done && pattern.cells[Number(index)] === chosen).length;
  host.innerHTML = `<div class="work-summary"><h2>${esc(pattern.name)}</h2><select id="workPattern">${state.patterns.map(p=>`<option value="${p.id}" ${p.id===pattern.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>${unknown ? `<p class="pattern-warning">${unknown} 个有豆格的色号未识别，点击“编辑”修正后才能完成库存扣减。</p>` : ''}<div class="work-stats"><span>已完成 <strong>${complete}</strong> / ${total}</span><span>${Math.round(complete/Math.max(total,1)*100)}%</span><button class="text-button" id="finishWork" ${pattern.consumed||insufficient||unknown?'disabled':''}>${finishLabel}</button></div><div class="work-color-summary"><i class="color-swatch" style="height:20px;width:26px;margin:0;background:${chosen==='all'?'#e2f1ea':colorMap.get(chosen)?.color}"></i><span>${chosen==='all'?'全部色号':`当前色号 ${chosen}`}</span><strong>${activeDone} / ${activeCount}</strong><span>已拼</span></div><div class="editor-tools"><label>当前色号 <select id="workColor"><option value="all">显示全部</option>${colors.map(code=>`<option value="${code}" ${chosen===code?'selected':''}>${code} · ${counts[code]} 颗 · 库存 ${fmt(state.stock[code])}</option>`).join('')}</select></label><button class="secondary-button" id="nextCell">标记下一个${chosen==='all'?'':' '+chosen}格</button><label class="tool-group">缩放 <input id="workZoom" type="range" min="12" max="36" step="2" value="${cellSize}"><span class="zoom-value">${cellSize}px</span></label></div><div class="pattern-scroll">${gridMarkup(pattern, { mode: 'work', chosen })}</div>`;
  host.querySelector('#workPattern').onchange = e => { state.activePattern = e.target.value; currentWorkColor = 'all'; persist(); renderWork(); };
  host.querySelector('#workColor').onchange = e => { currentWorkColor = e.target.value; renderWork(); };
  host.querySelector('#nextCell').onclick = () => { const idx=pattern.cells.findIndex((code,i)=> colorMap.has(code)&&(chosen==='all'||code===chosen)&&!pattern.done?.[i]); if(idx>=0){pattern.done={...pattern.done,[idx]:true};persist();renderWork();} };
  if(!pattern.consumed&&!insufficient) host.querySelector('#finishWork').onclick = () => confirmDialog('完成图纸并扣减库存', `<p class="notice">将按图纸用量从库存扣减 ${fmt(total)} 颗。此操作只能执行一次。</p>`, () => { Object.entries(counts).forEach(([code,count])=>state.stock[code]=Number(state.stock[code]||0)-count); pattern.consumed=true; persist(); renderWork(); renderInventory(); });
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
  const cell=event.target.closest('[data-workcell]'); if(!cell)return;
  const pattern=state.patterns.find(p=>p.id===state.activePattern);if(!pattern)return;
  const i=Number(cell.dataset.workcell);if(!colorMap.has(pattern.cells[i]))return;pattern.done={...pattern.done,[i]:!pattern.done?.[i]};persist();renderWork();
});
document.querySelector('#patternImage').addEventListener('change', event => loadImageFile(event.target.files?.[0]));
document.querySelector('#recognizePattern').onclick = recognizeImage;
document.querySelector('#saveRecognized').onclick = () => {
  if (!recognitionDraft) return;
  const pattern = recognitionDraft;
  state.patterns.unshift(pattern); state.activePattern = pattern.id; persist();
  recognitionDraft = null; editPatternId = pattern.id; renderPatterns(); renderEditor(pattern.id);
  document.querySelector('#saveRecognized').hidden = true;
  document.querySelector('#recognitionStatus').hidden = true;
  setRecognitionStatus('图纸已保存。可在网格中校对，或进入拼制模式。');
};
const imageCanvas = document.querySelector('#imageCanvas');
function canvasPoint(event) {
  const rect = imageCanvas.getBoundingClientRect();
  return { x: Math.round((event.clientX - rect.left) * imageCanvas.width / rect.width), y: Math.round((event.clientY - rect.top) * imageCanvas.height / rect.height) };
}
imageCanvas.addEventListener('pointerdown', event => { if (!sourceImage) return; imageCanvas.setPointerCapture(event.pointerId); cropDrag = canvasPoint(event); cropRect = { x: cropDrag.x, y: cropDrag.y, w: 1, h: 1 }; drawImageCanvas(); });
imageCanvas.addEventListener('pointermove', event => { if (!cropDrag) return; const point=canvasPoint(event); cropRect={x:Math.min(cropDrag.x,point.x),y:Math.min(cropDrag.y,point.y),w:Math.abs(point.x-cropDrag.x),h:Math.abs(point.y-cropDrag.y)};drawImageCanvas(); });
imageCanvas.addEventListener('pointerup', event => { if (!cropDrag) return; const point=canvasPoint(event);cropRect={x:Math.min(cropDrag.x,point.x),y:Math.min(cropDrag.y,point.y),w:Math.abs(point.x-cropDrag.x),h:Math.abs(point.y-cropDrag.y)};cropDrag=null;if(cropRect.w<20||cropRect.h<20)cropRect=null;drawImageCanvas(); });
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
  if(cell){const pattern=state.patterns.find(item=>item.id===editPatternId);if(!pattern)return;const index=Number(cell.dataset.cell);pattern.cells[index]=selectedEditColor;persist();renderEditor(editPatternId);renderPatterns();}
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
  canvas.querySelectorAll('.pattern-cell').forEach(cell=>{cell.style.width=`${cellSize}px`;cell.style.height=`${cellSize}px`;cell.textContent=cellSize>=24?cell.title.split(' · ').pop().replace('空格',''):'';});
  event.target.nextElementSibling.textContent=`${cellSize}px`;
});
renderInventory();renderPatterns();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
