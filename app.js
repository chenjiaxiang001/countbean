const palette = window.seedPalette;
const colorMap = new Map(palette.map(item => [item.code, item]));
const defaultState = () => ({ version: 1, stock: Object.fromEntries(palette.map(item => [item.code, 1000])), patterns: [], activePattern: null });
let state = loadState();
let editPatternId = null;
let currentWorkColor = 'all';

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
    const thumb = pattern.cells.slice(0, 16).map(code => `<i style="background:${colorMap.get(code)?.color || '#f1d4cd'}"></i>`).join('');
    return `<article class="pattern-row"><div class="pattern-thumb">${thumb}</div><div class="pattern-info"><strong>${esc(pattern.name)}</strong><p>${pattern.width} × ${pattern.height} 格 · ${fmt(Object.values(counts).reduce((a,b)=>a+b,0))} 颗 · ${done} 已完成</p></div><div class="row-actions"><button data-pattern="edit" data-id="${pattern.id}">编辑</button><button data-pattern="work" data-id="${pattern.id}">开始拼</button><button data-pattern="delete" data-id="${pattern.id}">删除</button></div></article>`;
  }).join('') : '<div class="empty-list">还没有图纸。粘贴色号网格后即可统计用量。</div>';
  if (editPatternId) renderEditor(editPatternId);
}
function countPattern(pattern) { return pattern.cells.reduce((counts, code) => { if (colorMap.has(code)) counts[code] = (counts[code] || 0) + 1; return counts; }, {}); }
function parseGrid(text) {
  return text.trim().split(/\r?\n/).map(line => line.trim().split(/[\s,，;；|]+/).filter(Boolean).map(code => code.toUpperCase()));
}
function importGrid() {
  const rows = parseGrid(document.querySelector('#patternInput').value);
  if (!rows.length || !rows[0]?.length) return alert('请先粘贴色号网格。');
  const width = Math.max(...rows.map(row => row.length));
  const cells = rows.flatMap(row => Array.from({ length: width }, (_, i) => colorMap.has(row[i]) ? row[i] : ''));
  const name = document.querySelector('#patternName').value.trim() || `图纸 ${state.patterns.length + 1}`;
  const pattern = { id: crypto.randomUUID(), name, width, height: rows.length, cells, done: {} };
  state.patterns.unshift(pattern); state.activePattern = pattern.id; persist();
  document.querySelector('#patternInput').value = ''; document.querySelector('#patternName').value = '';
  renderPatterns(); showView('patterns'); editPatternId = pattern.id; renderEditor(pattern.id);
}
function renderEditor(id) {
  const pattern = state.patterns.find(item => item.id === id);
  const editor = document.querySelector('#patternEditor');
  if (!pattern) { editor.hidden = true; return; }
  editor.hidden = false;
  const counts = countPattern(pattern);
  const unknown = pattern.cells.filter(code => !colorMap.has(code)).length;
  const shortages = Object.entries(counts).filter(([code, count]) => count > Number(state.stock[code] || 0));
  const options = palette.map(({code}) => `<option value="${code}">${code}</option>`).join('');
  const selectedColor = editor.querySelector('#editColor')?.value || palette[0].code;
  editor.innerHTML = `<div class="editor-head"><div><h2>${esc(pattern.name)}</h2><p>${pattern.width} × ${pattern.height} · 点击格子可改色 · ${unknown ? `${unknown} 个未知色号需要修正` : shortages.length ? `${shortages.length} 个色号库存不足` : '库存充足'}</p></div><button class="text-button" id="closeEditor">收起</button></div>
  <div class="editor-tools"><label>选择颜色 <select id="editColor">${options}</select></label><button class="secondary-button" id="clearDone">重置拼制进度</button></div>
  <div class="pattern-color-list">${Object.entries(counts).sort((a,b)=>a[0].localeCompare(b[0])).map(([code,count]) => `<div class="pattern-color-row"><i class="color-swatch" style="height:16px;width:20px;margin:0;background:${colorMap.get(code).color}"></i><span>${code} · 需要 ${count} 颗 · 库存 ${fmt(state.stock[code])}</span><strong style="color:${count>Number(state.stock[code]||0)?'var(--red)':'var(--green)'}">${count>Number(state.stock[code]||0)?`缺 ${count-Number(state.stock[code]||0)}`:'够用'}</strong></div>`).join('')}</div>
  <div class="pattern-canvas" style="grid-template-columns:repeat(${pattern.width}, minmax(12px, 1fr));margin-top:14px">${pattern.cells.map((code,index) => `<button class="pattern-cell ${colorMap.has(code)?'':'unknown'}" data-cell="${index}" title="${code||'未识别'}" style="background:${colorMap.get(code)?.color||'#f5d1cc'}">${pattern.width < 24 ? esc(code) : ''}</button>`).join('')}</div>`;
  editor.querySelector('#editColor').value = selectedColor;
  editor.querySelector('#closeEditor').onclick = () => { editor.hidden = true; editPatternId = null; };
  editor.querySelector('#clearDone').onclick = () => { pattern.done = {}; persist(); renderEditor(id); renderPatterns(); };
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
  const insufficient = Object.entries(counts).some(([code,count]) => count > Number(state.stock[code] || 0));
  const finishLabel = pattern.consumed ? '库存已扣减' : insufficient ? '库存不足，先调整' : '完成并扣库存';
  host.innerHTML = `<div class="work-summary"><h2>${esc(pattern.name)}</h2><select id="workPattern">${state.patterns.map(p=>`<option value="${p.id}" ${p.id===pattern.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div class="work-stats"><span>已完成 <strong>${complete}</strong> / ${total}</span><span>${Math.round(complete/Math.max(total,1)*100)}%</span><button class="text-button" id="finishWork" ${pattern.consumed||insufficient?'disabled':''}>${finishLabel}</button></div><div class="editor-tools"><label>当前色号 <select id="workColor"><option value="all">显示全部</option>${colors.map(code=>`<option value="${code}" ${chosen===code?'selected':''}>${code} · ${counts[code]} 颗 · 库存 ${fmt(state.stock[code])}</option>`).join('')}</select></label><button class="secondary-button" id="nextCell">标记下一个${chosen==='all'?'':' '+chosen}格</button></div><div class="pattern-canvas" style="grid-template-columns:repeat(${pattern.width}, minmax(12px, 1fr))">${pattern.cells.map((code,index)=>`<button class="pattern-cell ${chosen!=='all'&&code!==chosen?'dim':''} ${pattern.done?.[index]?'done':''} ${colorMap.has(code)?'':'unknown'}" data-workcell="${index}" title="${code||'未识别'}" style="background:${colorMap.get(code)?.color||'#f5d1cc'}">${pattern.width<24?esc(code):''}</button>`).join('')}</div>`;
  host.querySelector('#workPattern').onchange = e => { state.activePattern = e.target.value; currentWorkColor = 'all'; persist(); renderWork(); };
  host.querySelector('#workColor').onchange = e => { currentWorkColor = e.target.value; renderWork(); };
  host.querySelector('#nextCell').onclick = () => { const idx=pattern.cells.findIndex((code,i)=> (chosen==='all'||code===chosen)&&!pattern.done?.[i]); if(idx>=0){pattern.done={...pattern.done,[idx]:true};persist();renderWork();} };
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
document.querySelector('#newPattern').onclick = () => { document.querySelector('#patternInput').focus(); window.scrollTo({top:document.querySelector('#importPanel').offsetTop,behavior:'smooth'}); };
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
document.querySelector('#patternEditor').addEventListener('click', event => {
  const cell=event.target.closest('[data-cell]'); if(!cell)return;
  const pattern=state.patterns.find(p=>p.id===editPatternId); if(!pattern)return;
  pattern.cells[Number(cell.dataset.cell)]=document.querySelector('#editColor').value;persist();renderEditor(editPatternId);renderPatterns();
});
document.querySelector('#workArea').addEventListener('click', event => {
  const cell=event.target.closest('[data-workcell]'); if(!cell)return;
  const pattern=state.patterns.find(p=>p.id===state.activePattern);if(!pattern)return;
  const i=Number(cell.dataset.workcell);pattern.done={...pattern.done,[i]:!pattern.done?.[i]};persist();renderWork();
});
document.querySelector('#exportData').onclick = () => {
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='豆豆工坊-备份.json';a.click();URL.revokeObjectURL(url);
};
document.querySelector('#importData').onclick = () => document.querySelector('#backupInput').click();
document.querySelector('#backupInput').onchange = async e => { try {const data=JSON.parse(await e.target.files[0].text());if(data.version!==1||!data.stock||!Array.isArray(data.patterns))throw Error();state=data;persist();renderInventory();renderPatterns();alert('备份已恢复');}catch{alert('备份文件格式无效');} };
renderInventory();renderPatterns();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
