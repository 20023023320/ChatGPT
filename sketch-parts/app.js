'use strict';

const el = id => document.getElementById(id);
const { parts, bounds, rank, suggestLeft, rankWithLeft, nearby } = SketchMatcher;
const byId = new Map(parts.map(part => [part.id, part]));
const generatedPartId=/^GEN-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function partLabel(part){
  return generatedPartId.test(part.id)?part.name:part.name+' · '+part.id;
}
const pad = el('pad');
let strokes = [];
let activePointer = null;
let frontQuery = null;
let editingLeft = false;
let combined = false;
let queryMode = 'plane';
const {groups,names:modeNames,linesFor:viewLines}=SketchMatcher;
const drafts = new Map();
const histories={plane:[],solid:[]};
const undoStack=()=>editingLeft?frontQuery.leftHistory:histories[queryMode];
let padTool='pen',beforeGesture=null,lastContact=null;
const diameter=el('eraser-size'),cursor=el('eraser-cursor');
function updateDiameter() {
  cursor.style.width=cursor.style.height=diameter.value+'px';
  el('eraser-size-value').textContent=diameter.value+' px';
}
diameter.oninput=updateDiameter;
updateDiameter();
el('pad-tools').onclick=event=>{
  const tool=event.target.closest('[data-tool]')?.dataset.tool;
  if(!tool || activePointer!==null) return;
  padTool=tool;
  for(const button of el('pad-tools').children) button.setAttribute('aria-pressed',String(button.dataset.tool===tool));
  el('eraser-size-control').hidden=tool==='pen';
  pad.classList.toggle('erasing',tool!=='pen');
  cursor.hidden=true;
};
const queryCategory=el('query-category');
PartCategories.populate(queryCategory,true);
queryCategory.onchange=()=>{
  if(frontQuery) search(); else renderParts(null);
};

function draw(canvas, lines, width) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#294637';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of lines) {
    ctx.beginPath();
    ctx.moveTo(...line[0]);
    for (let i = 1; i < line.length; i++) ctx.lineTo(...line[i]);
    ctx.stroke();
  }
}

function fit(lines, width, height, fraction) {
  const box = bounds(lines);
  const scale = fraction * Math.min(width / box.width, height / box.height);
  return lines.map(line => line.map(([x,y]) => [
    (x-box.left-box.width/2)*scale + width/2,
    (y-box.top-box.height/2)*scale + height/2
  ]));
}

function renderParts(ranking, joint = false) {
  combined = joint;
  const close = ranking && nearby(ranking[0], ranking[1]);
  const hasLeft=!editingLeft && !!frontQuery?.leftStrokes.length;
  const askLeft = ranking && queryMode === 'plane' && !editingLeft && suggestLeft(ranking);
  const entries = ranking || parts.filter(part=>(!queryCategory.value || part.category===queryCategory.value) && groups[queryMode].some(view=>viewLines(part,view)?.length));
  el('part-count').textContent=entries.length+' 件';
  el('prompt').hidden = !askLeft && !hasLeft;
  el('add-left').textContent=hasLeft?'继续编辑左视图 →':'补画左视图 →';
  el('add-left').disabled=hasLeft&&!strokes.length;
  if(hasLeft) el('prompt-text').textContent='已保留补充左视图，可继续编辑并合并检索。';
  else if (askLeft) {
    const names=ranking.slice(0,2).map(item=>'「'+byId.get(item.id).name+'」').join('和');
    el('prompt-text').textContent = names + '的平面匹配接近，左视轮廓有差异。请补画侧面的台阶或厚度。';
  }
  el('list-title').textContent = joint ? '双视图结果' : ranking ? modeNames[queryMode]+'结果' : '参考零件';
  el('list-note').textContent = !ranking ? '参考线稿包含内置零件和仓库中已导入的模型。' :
    joint ? (close ? '两项综合距离仍然接近，建议核对实物尺寸。' : '综合正视与左视轮廓距离排序。') :
    editingLeft ? '当前保留首次排序。缩略图展示各候选的标准左视轮廓。' :
    close ? '前两项匹配接近，当前草图不足以确定型号。' : '按双向轮廓距离排序，越接近的零件越靠前。';
  el('parts').replaceChildren();
  if(!entries.length) el('list-note').textContent='此类别暂无该视图的零件，可切换范围或在仓库导入模型。';
  entries.forEach(({ id }, i) => {
    const part = byId.get(id);
    const mode = editingLeft ? 'left' : ranking?.[i].view || groups[queryMode].find(view=>viewLines(part,view)?.length);
    const row = document.createElement('div');
    row.className = 'part' + (ranking && !i && !close ? ' best' : '');
    const preview = document.createElement('canvas');
    preview.width = 176;
    preview.height = 116;
    preview.setAttribute('aria-label', part.name + modeNames[mode]);
    draw(preview, fit(viewLines(part,mode), preview.width, preview.height, .78), 3);
    const caption = document.createElement('div');
    const name = document.createElement('div');
    const code = document.createElement('div');
    name.className = 'part-name';
    name.textContent = part.name;
    code.className = 'part-code';
    code.textContent = generatedPartId.test(id)?part.category:part.category+' · '+id;
    if(ranking) code.textContent+=' · '+modeNames[ranking[i].view]+(joint?' + 左视图':'')+' · 距离 '+ranking[i].distance.toFixed(4);
    caption.append(name, code);
    if (ranking && (!editingLeft || joint)) {
      const review = document.createElement('button');
      review.className='replay';
      review.textContent='核验候选';
      review.onclick=()=>reviewCandidate(part,ranking,joint);
      caption.append(review);
    }
    if (part.iso) {
      const open = document.createElement('button');
      open.className = 'replay';
      open.textContent = '查看模型';
      open.onclick = () => openStoredModel(id);
      caption.append(open);
    }
    row.append(preview, caption);
    if (ranking) {
      const order = document.createElement('span');
      order.className = 'rank';
      const firstEqual = ranking.findIndex(item => item.distance === ranking[i].distance);
      const tied = firstEqual !== i || ranking[i+1]?.distance === ranking[i].distance;
      order.textContent = tied ? '并列 ' + (firstEqual+1) : '#' + (i+1);
      row.append(order);
    }
    el('parts').append(row);
  });
}

const shapeNames={line:'直线',circle:'圆',ellipse:'椭圆',triangle:'三角形',square:'正方形',rectangle:'矩形'};
let selectedShape=null,holdTimer=null,holdPoint=null,snapped=null,rawStroke=null;
const vertexInputs=Array.from({length:3},(_,i)=>['X','Y'].map(axis=>{
  const input=document.createElement('input'),label=document.createElement('label');
  input.type='number';input.step='any';
  label.append('ABC'[i]+axis+' ',input);el('triangle-points').append(label);
  return input;
}));
function refreshShapeEditor() {
  const choices=strokes.filter(line=>SketchShapes.describe(line));
  if(!choices.includes(selectedShape)) selectedShape=choices.at(-1);
  el('shape-editor').hidden=!selectedShape || activePointer!==null;
  if(!selectedShape) return;
  el('shape-select').replaceChildren(...choices.map((line,i)=>new Option((i+1)+' · '+shapeNames[SketchShapes.describe(line).kind],String(strokes.indexOf(line)))));
  el('shape-select').value=String(strokes.indexOf(selectedShape));
  const shape=SketchShapes.describe(selectedShape);
  el('shape-angle').value=+(shape.angle*180/Math.PI).toFixed(3);
  el('shape-restore').disabled=!shape.original;
  el('triangle-editor').hidden=shape.kind!=='triangle';
  if(shape.kind==='triangle') vertexInputs.forEach((pair,i)=>pair.forEach((input,j)=>{
    input.value=+(selectedShape[i][j]*SketchShapes.mmPerUnit).toFixed(3);
  }));
  el('shape-width-label').textContent=({line:'长度',circle:'直径',square:'边长'})[shape.kind] || '宽';
  el('shape-height-control').hidden=['line','circle','square'].includes(shape.kind);
  for(const axis of ['width','height']) el('shape-'+axis).value=+(shape[axis]*SketchShapes.mmPerUnit).toFixed(3);
}
el('shape-select').onchange=()=>{selectedShape=strokes[+el('shape-select').value];refreshShapeEditor();};
el('shape-apply').onclick=()=>{
  if(!selectedShape || activePointer!==null) return;
  const shape=SketchShapes.describe(selectedShape);
  const width=el('shape-width').valueAsNumber/SketchShapes.mmPerUnit;
  const height=el('shape-height-control').hidden?(shape.kind==='line'?0:width):el('shape-height').valueAsNumber/SketchShapes.mmPerUnit;
  if(!(width>0) || (shape.kind!=='line' && !(height>0))) return;
  const angle=el('shape-angle').valueAsNumber*Math.PI/180;
  if(!Number.isFinite(angle)) return;
  const line=SketchShapes.render({...shape,width,height,angle});
  replaceSelected(line);
};
function replaceSelected(line) {
  undoStack().push(strokes);
  strokes=strokes.map(item=>item===selectedShape?line:item);
  selectedShape=line;edited();refreshPad();
}
el('shape-restore').onclick=()=>{
  const original=SketchShapes.describe(selectedShape)?.original;
  if(original) replaceSelected(original);
};
el('triangle-apply').onclick=()=>{
  const vertices=vertexInputs.map(pair=>pair.map(input=>input.valueAsNumber/SketchShapes.mmPerUnit));
  if(!vertices.flat().every(Number.isFinite)) return;
  const line=SketchShapes.triangle(vertices,SketchShapes.describe(selectedShape).original);
  if(line) replaceSelected(line);
};
function armHold(point) {
  if(holdPoint && Math.hypot(point[0]-holdPoint[0],point[1]-holdPoint[1])<4) return;
  clearTimeout(holdTimer);
  holdPoint=point;
  holdTimer=setTimeout(()=>{
    const raw=strokes.at(-1);
    const shape=SketchShapes.recognize(raw);
    if(!shape) return;
    shape.original=raw;rawStroke=raw;snapped=shape;
    selectedShape=SketchShapes.render(shape);
    strokes=[...beforeGesture,selectedShape];
    draw(pad,strokes,4);
  },500);
}
function refreshPad() {
  refreshShapeEditor();
  draw(pad, strokes, 4);
  el('empty').hidden = strokes.length > 0;
  el('stroke-count').textContent = new Set(strokes.map(SketchEraser.origin)).size + ' 笔';
  el('clear').disabled = !strokes.length || activePointer!==null;
  el('undo').disabled = !undoStack().length || activePointer !== null;
  el('build-sketch').disabled = activePointer !== null || !(editingLeft ? frontQuery : strokes.some(line => line.length > 1));
  el('search').disabled = activePointer !== null || !strokes.some(line => line.length > 1);
}
function pointerPoint(event,clamp=true) {
  const box = pad.getBoundingClientRect();
  const x=(event.clientX-box.left)*pad.width/box.width,y=(event.clientY-box.top)*pad.height/box.height;
  return clamp?[Math.max(0,Math.min(pad.width,x)),Math.max(0,Math.min(pad.height,y))]:[x,y];
}
function showCursor(event) {
  if(padTool==='pen') return;
  const box=pad.getBoundingClientRect();
  cursor.style.left=event.clientX-box.left+'px';
  cursor.style.top=event.clientY-box.top+'px';
  cursor.hidden=false;
}
pad.onpointerleave=()=>{cursor.hidden=true;};
function applyEraser(event) {
  const point=pointerPoint(event,false),box=pad.getBoundingClientRect();
  strokes=SketchEraser.erase(strokes,lastContact || point,point,diameter.valueAsNumber/2,
    box.width/pad.width,box.height/pad.height,padTool==='whole');
  lastContact=point;
}
function edited() {
  if(!editingLeft){
    if(frontQuery?.leftStrokes.length){
      frontQuery.strokes=strokes;
      frontQuery.ranking=strokes.length?rank(strokes,queryMode,queryCategory.value):[];
    }else frontQuery=null;
  }
  renderParts(editingLeft?frontQuery.ranking:null);
}
pad.addEventListener('pointerdown', event => {
  if (event.button !== 0 || activePointer !== null) return;
  activePointer = event.pointerId;
  pad.setPointerCapture(activePointer);
  beforeGesture=strokes;
  lastContact=null;
  if(padTool==='pen') {const point=pointerPoint(event);strokes=[...strokes,[point]];armHold(point);}
  else {showCursor(event);applyEraser(event);}
  refreshPad();
});
function extendStroke(event) {
  const line = strokes[strokes.length - 1];
  const point = pointerPoint(event);
  if(snapped) {
    const radius=p=>Math.hypot(p[0]-snapped.center[0],p[1]-snapped.center[1]);
    const factor=Math.max(.03,radius(point)/Math.max(1,radius(holdPoint)));
    selectedShape=SketchShapes.render({...snapped,width:snapped.width*factor,height:snapped.height*factor});
    strokes=[...beforeGesture,selectedShape];return;
  }
  armHold(point);
  const previous = line[line.length - 1];
  if (Math.hypot(point[0]-previous[0], point[1]-previous[1]) >= 1) line.push(point);
}
pad.addEventListener('pointermove', event => {
  if(activePointer===null || activePointer===event.pointerId) showCursor(event);
  if (event.pointerId !== activePointer) return;
  const samples=event.getCoalescedEvents?.();
  for(const sample of samples?.length?samples:[event]) {
    if(padTool==='pen') extendStroke(sample);else applyEraser(sample);
  }
  draw(pad, strokes, 4);
});
function finishStroke(event) {
  if (activePointer !== event.pointerId) return;
  if(event.type==='pointerup') {
    if(padTool==='pen') {
      extendStroke(event);
      if(strokes.at(-1).length<2) strokes=beforeGesture;
    } else applyEraser(event);
    if(strokes!==beforeGesture) {undoStack().push(beforeGesture);if(rawStroke) undoStack().push([...beforeGesture,rawStroke]);edited();}
  } else strokes=beforeGesture;
  clearTimeout(holdTimer);holdPoint=null;snapped=null;rawStroke=null;
  activePointer = null;
  beforeGesture=null;
  if(event.pointerType!=='mouse') cursor.hidden=true;
  refreshPad();
}
for (const type of ['pointerup','pointercancel','lostpointercapture']) pad.addEventListener(type, finishStroke);
function cancelPadGesture() {
  if(activePointer!==null) finishStroke({type:'pointercancel',pointerId:activePointer});
}
el('clear').onclick = () => {
  undoStack().push(strokes);
  strokes = [];
  edited();
  refreshPad();
  el('announcement').textContent = '画板已清空';
};
el('undo').onclick=()=>{
  strokes=undoStack().pop();
  edited();
  refreshPad();
};
document.addEventListener('keydown',event=>{
  if(event.ctrlKey&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='z'&&
     !document.querySelector('dialog[open]')&&pad.getClientRects().length&&!el('undo').disabled&&
     !event.target.matches('input,textarea,[contenteditable=true]')){
    event.preventDefault();el('undo').click();
  }
});
const historyKey='sketchparts.search-history';
const historyLimit=6;
let recentSearches=[];
try{
  const saved=JSON.parse(localStorage.getItem(historyKey));
  if(Array.isArray(saved)) recentSearches=saved.slice(0,historyLimit);
}catch { /* Search remains available with session-only history. */ }
function sketchSnapshot(lines){
  const canvas=document.createElement('canvas');
  canvas.width=480;canvas.height=300;
  draw(canvas,lines.map(line=>line.map(([x,y])=>[x*canvas.width/pad.width,y*canvas.height/pad.height])),2);
  return canvas.toDataURL('image/png');
}
function search(record=true) {
  const result = editingLeft ? rankWithLeft(rank(frontQuery.strokes,['front','top'],queryCategory.value), strokes) : rank(strokes,queryMode,queryCategory.value);
  if(record){
    const first=result[0] && byId.get(result[0].id);
    recentSearches.unshift({time:Date.now(),mode:editingLeft?'双视图':modeNames[queryMode],
      category:queryCategory.value||'全部类别',count:result.length,first:first?partLabel(first):'无匹配',
      sketch:sketchSnapshot(editingLeft?frontQuery.strokes:strokes),left:editingLeft?sketchSnapshot(strokes):null,
      group:queryMode,pen:SketchEraser.serialize(editingLeft?frontQuery.strokes:strokes),
      leftPen:editingLeft?SketchEraser.serialize(strokes):null});
    recentSearches=recentSearches.slice(0,historyLimit);
    try{localStorage.setItem(historyKey,JSON.stringify(recentSearches));}catch { /* Keep this session's six entries. */ }
  }
  if (!result.length) {
    renderParts(null);
    el('list-note').textContent='当前方向没有可用候选，请选择其他方向或导入模型。';
    return;
  }
  if (!editingLeft) {
    if(frontQuery?.strokes===strokes) frontQuery.ranking=result;
    else frontQuery={strokes,ranking:result,leftHistory:[],leftStrokes:[]};
  }
  renderParts(result, editingLeft);
  el('announcement').textContent = nearby(result[0],result[1]) ? '前两项匹配接近，请查看候选。' : '第一候选：' + byId.get(result[0].id).name;
}
el('search').onclick = () => search();

function setLeftMode(enabled) {
  editingLeft = enabled;
  activePointer = null;
  cursor.hidden=true;
  el('front-summary').hidden = !enabled;
  el('query-mode').disabled = enabled;
  queryCategory.disabled=enabled;
  el('front-examples').hidden = enabled || queryMode !== 'plane';
  el('left-examples').hidden = !enabled;
  el('view-label').textContent = enabled ? '左视图' : modeNames[queryMode];
  el('pad-title').textContent = enabled ? '补充左视图' : '草图画板';
  el('pad').setAttribute('aria-label', '绘制零件' + el('view-label').textContent);
  el('empty-title').textContent = enabled ? '画出侧面轮廓' : '从外轮廓开始画';
  el('empty-tip').textContent = enabled ? '板面竖直，背面朝右；有凸台时画出台阶' : '按住拖动，松开后可继续画孔或槽';
  el('search-label').textContent = enabled ? '合并两张草图检索' : '查找零件';
  el('mode-help').textContent = enabled ? '补充左视图，用第二个方向区分相近候选。' : queryMode==='solid' ? '画出顶面和侧面的可见棱边，自动比对四个斜向视角。' : '画任意一个正投影视图，自动比对正视、俯视和左视。';
}
function selectGroup(mode) {
  queryMode=mode;
  el('query-mode').querySelector('input[value="'+mode+'"]').checked=true;
}
el('query-mode').onchange=e=>{
  cancelPadGesture();
  drafts.set(queryMode,strokes);
  selectGroup(e.target.value);
  strokes=drafts.get(queryMode)||[];
  frontQuery=null;
  setLeftMode(false);refreshPad();renderParts(null);
};
el('add-left').onclick = () => {
  if (!frontQuery) return;
  cancelPadGesture();
  setLeftMode(true);
  const preview = el('front-preview');
  draw(preview, fit(frontQuery.strokes, preview.width, preview.height, .84), 2);
  strokes = frontQuery.leftStrokes;
  refreshPad();
  renderParts(frontQuery.ranking);
};
el('edit-front').onclick = () => {
  cancelPadGesture();
  frontQuery.leftStrokes=strokes;
  setLeftMode(false);
  strokes = frontQuery.strokes;
  refreshPad();
  renderParts(frontQuery.ranking);
};

function switchView(page) {
  cancelPadGesture();
  for(const [id,tab] of [['workspace','work-tab'],['cad','cad-tab'],['warehouse','warehouse-tab'],['checks','checks-tab']]){
    el(id).hidden=id!==page;
    if(id===page) el(tab).setAttribute('aria-current','page');
    else el(tab).removeAttribute('aria-current');
  }
}
function loadSketch(lines,group,category='',measured=false) {
  switchView('workspace');
  queryCategory.value=category;
  drafts.set(queryMode,editingLeft?frontQuery.strokes:strokes);
  selectGroup(group);
  setLeftMode(false);
  frontQuery=null;
  histories[group].push(drafts.get(group) || []);
  strokes = measured?lines:fit(lines, pad.width, pad.height, .68);
  refreshPad();
  search();
}
function loadMeasuredSketch(lines,group='plane') {loadSketch(lines,group,'',true);}
function replay(sample) { loadSketch(sample.strokes,'plane'); }
el('work-tab').onclick = () => switchView('workspace');
el('try-case').onclick = () => replay(sketchCases[0]);
el('try-flange').onclick = () => replay({ strokes: flangeSamples.front });
for (const field of ['flat','boss']) el('try-' + field).onclick = () => {
  cancelPadGesture();
  undoStack().push(strokes);
  strokes = fit(flangeSamples[field], pad.width, pad.height, .78);
  refreshPad();
  search();
};
function reviewCandidate(part,ranking,joint) {
  const dialog=el('review');
  const match=ranking.find(item=>item.id===part.id);
  el('review-name').textContent=partLabel(part);
  el('review-meta').textContent=modeNames[queryMode]+' · '+modeNames[match.view]+(joint?' + 左视图':'')+' · 归一化轮廓距离 '+match.distance.toFixed(4)+'（越小越接近）';
  const views=el('review-views');views.replaceChildren();
  const addView=(label,lines)=>{
    if(!lines?.length) return;
    const fig=document.createElement('figure'),canvas=document.createElement('canvas'),cap=document.createElement('figcaption');
    canvas.width=200;canvas.height=140;cap.textContent=label;
    draw(canvas,fit(lines,200,140,.82),2);fig.append(canvas,cap);views.append(fig);
  };
  addView('输入 · '+modeNames[queryMode],frontQuery.strokes);
  if(joint) addView('补充 · 左视图',strokes);
  addView('命中 · '+modeNames[match.view],viewLines(part,match.view));
  for(const mode of groups.plane.filter(view=>view!==match.view)) addView(modeNames[mode],viewLines(part,mode));
  const record={mode:queryMode,category:queryCategory.value || '全部类别',sketch:frontQuery.strokes,leftSupplement:joint?strokes:null,
    candidates:ranking.map(({id,view,distance})=>({id,view,distance})),confirmed:{id:part.id,name:part.name}};
  el('review-status').textContent=ranking.length===1?'当前只有一个候选，请核对结构。':nearby(ranking[0],ranking[1])?'前两项距离接近，请核对结构差异。':'请核对孔位、外形和台阶。';
  el('review-save').onclick=()=>{
    const data=new Blob([JSON.stringify({...record,confirmedAt:new Date().toISOString()},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(data),link=document.createElement('a');
    link.href=url;link.download='零件核验-'+part.id.replace(/[^\w\u4e00-\u9fff-]/g,'_')+'.json';
    link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    el('review-status').textContent='已确认 '+part.name+'，已请求下载核验记录。';
  };
  dialog.showModal();
}
el('review-close').onclick=()=>el('review').close();
el('checks-tab').onclick = () => {
  const rows=el('records');
  rows.replaceChildren();
  for(const item of recentSearches){
    const row=rows.insertRow();
    const segments=item.first.split(' · ');
    const first=segments.length>1 && generatedPartId.test(segments.at(-1))?segments.slice(0,-1).join(' · '):item.first;
    for(const value of [new Date(item.time).toLocaleString('zh-CN'),item.mode,item.category,item.count,first])
      row.insertCell().textContent=value;
    const cell=row.insertCell();
    if(!item.sketch){cell.textContent='当时未保存草图';continue;}
    const button=document.createElement('button');
    button.className='replay';button.textContent='回顾草图';cell.append(button);
    button.onclick=()=>{
      const gallery=el('history-images');gallery.replaceChildren();
      for(const [label,src] of [[item.left?'平面图':item.mode,item.sketch],['补充左视图',item.left]]){
        if(!src)continue;
        const fig=document.createElement('figure'),caption=document.createElement('figcaption'),img=document.createElement('img');
        caption.textContent=label;img.alt=label+'检索笔迹';img.src=src;
        fig.append(caption,img);gallery.append(fig);
      }
      el('history-review').showModal();
      el('history-edit').disabled=!item.pen;
      el('history-legacy').hidden=!!item.pen;
      el('history-edit').onclick=()=>{
        el('history-review').close();switchView('workspace');
        drafts.set(queryMode,editingLeft?frontQuery.strokes:strokes);
        selectGroup(item.group);setLeftMode(false);frontQuery=null;
        queryCategory.value=[...queryCategory.options].some(o=>o.value===item.category)?item.category:'';
        histories[queryMode].length=0;
        strokes=SketchEraser.deserialize(item.pen);
        if(item.leftPen){
          frontQuery={strokes,ranking:rank(strokes,queryMode,queryCategory.value),
            leftHistory:[],leftStrokes:SketchEraser.deserialize(item.leftPen)};
          el('add-left').onclick();
        }else{refreshPad();renderParts(null);}
        el('pad-title').scrollIntoView({block:'start'});
      };
    };
  }
  el('history-empty').hidden=recentSearches.length>0;
  switchView('checks');
};
el('part-count').textContent = parts.length + ' 件';
renderParts(null);
refreshPad();
