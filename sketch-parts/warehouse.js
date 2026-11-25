'use strict';

const modelCatalog = new Map();
const sessionMeshes = new Map();
let modelDB, selectedId;
const stockViewer = createMeshViewer(el('model-view'));
const stockCategories=()=>[...PartCategories.names,PartCategories.pending];
let stockCategory='';
PartCategories.populate(el('import-category'),false);
PartCategories.populate(el('model-category'),false);

function requestValue(request) {
  return new Promise((resolve,reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function registerModel(part) {
  PartCategories.apply(part);
  if(!PartCategories.names.includes(part.category)) part.category=PartCategories.pending;
  SketchMatcher.addPart(part);
  byId.set(part.id,part);
  modelCatalog.set(part.id,part);
}
function matchesStockSearch(part) {
  const term=el('stock-filter').value.trim().toLowerCase();
  return [part.name,part.id,part.category,part.family].join(' ').toLowerCase().includes(term);
}
function clearModelPreview() {
  selectedId=null;
  stockViewer.setMesh(null);
  el('model-name').textContent='模型预览';
  el('edit-generated').hidden=true;
  el('model-empty').textContent='请选择一个零件';
  el('model-empty').hidden=false;
  el('model-info').textContent='拖动旋转 · 滚轮缩放';
  el('sample-info').hidden=true;
  el('edit-class').hidden=true;
  el('reset-camera').disabled=true;
  el('orthos').replaceChildren();
}
function listStock() {
  el('rename-class').disabled=!stockCategory || stockCategory===PartCategories.pending;
  const list=el('stock-list');
  list.replaceChildren();
  const grouped=new Map(stockCategories().map(name=>[name,[]]));
  for(const part of modelCatalog.values()) {
    grouped.get(part.category).push(part);
  }
  for(const button of el('stock-directory').children) {
    const category=button.dataset.category;
    button.lastElementChild.textContent=category ? grouped.get(category).length : modelCatalog.size;
    button.setAttribute('aria-pressed',String(category===stockCategory));
  }
  el('stock-list-title').textContent=stockCategory || '全部零件';
  const visible=[];
  for(const [category,items] of grouped) {
    if(stockCategory && stockCategory!==category) continue;
    const matching=items.filter(matchesStockSearch);
    if(!matching.length) continue;
    if(!stockCategory) {
      const heading=document.createElement('h3');
      heading.className='stock-group-title';
      heading.textContent=category+' · '+matching.length;
      list.append(heading);
    }
    for(const part of matching) {
      const btn=document.createElement('button');
      btn.className='stock-item';
      btn.dataset.id=part.id;
      btn.setAttribute('aria-pressed',String(part.id===selectedId));
      btn.textContent=partLabel(part);
      btn.onclick=()=>openStoredModel(part.id);
      list.append(btn);
      visible.push(part.id);
    }
  }
  el('stock-count').textContent=visible.length+' 件';
  if(!visible.length) {
    const hint=document.createElement('p');
    hint.className='stock-empty';
    hint.textContent=el('stock-filter').value.trim() ? '没有匹配的零件，请更换关键词或选择其他类别。' : '该类别暂无零件，可导入 STL 时归入此类。';
    list.append(hint);
  }
  return visible;
}
function browseStock() {
  const visible=listStock();
  if(visible.includes(selectedId)) return;
  if(visible.length) openStoredModel(visible[0]);
  else clearModelPreview();
}
function drawDirectory() {
  el('stock-directory').replaceChildren();
  for(const category of ['',...stockCategories()]) {
    const button=document.createElement('button');
    button.type='button';
    button.dataset.category=category;
    button.append(category || '全部零件',document.createElement('span'));
    button.onclick=()=>{
      stockCategory=category;
      el('import-category').value=category || PartCategories.pending;
      browseStock();
    };
    el('stock-directory').append(button);
  }
}
drawDirectory();
for(const [id,rename] of [['add-class',false],['rename-class',true]]) el(id).onclick=async()=>{
  await warehouseReady;
  const old=stockCategory,name=el('category-name').value.trim();
  if(rename && (!old || old===PartCategories.pending)) return;
  try {
    PartCategories.setCategory(name,rename && old);
    if(rename) for(const part of byId.values()) if(part.category===old) part.category=name;
    const query=queryCategory.value;
    for(const [select,all] of [[queryCategory,true],[el('import-category'),false],[el('model-category'),false]]) PartCategories.populate(select,all);
    queryCategory.value=rename && query===old ? name : query;
    stockCategory=name;
    el('import-category').value=name;
    el('category-name').value='';
    drawDirectory();updateCatalog();
    if(selectedId && modelCatalog.get(selectedId)?.category===name && matchesStockSearch(modelCatalog.get(selectedId))) await openStoredModel(selectedId);
    else browseStock();
    el('store-status').textContent='类别已保存。';
  } catch(error){el('store-status').textContent=error.message;}
};
el('stock-filter').oninput=browseStock;
function updateCatalog() {
  listStock();
  if(frontQuery) {
    frontQuery.ranking=rank(frontQuery.strokes,queryMode,queryCategory.value);
    if(editingLeft && combined) search(false);
    else renderParts(frontQuery.ranking);
  } else renderParts(null);
}

async function openStoredModel(id) {
  switchView('warehouse');
  selectedId=id;
  stockViewer.setMesh(null);
  const part=modelCatalog.get(id);
  // A search-result link may open a model outside the last warehouse filter.
  if((stockCategory && stockCategory!==part.category) || !matchesStockSearch(part)) {
    if(stockCategory) stockCategory=part.category;
    if(!matchesStockSearch(part)) el('stock-filter').value='';
    el('import-category').value=stockCategory || PartCategories.pending;
    listStock();
  } else {
    for(const btn of el('stock-list').querySelectorAll('.stock-item')) {
      btn.setAttribute('aria-pressed',String(btn.dataset.id===id));
    }
  }
  el('model-name').textContent=partLabel(part);
  const generated=part.source==='parametric';
  el('edit-generated').hidden=!generated;
  const timber=part.source==='timber';
  el('model-info').textContent=part.category+' · '+(timber ? '古建教学示意' : generated?'参数化模型':part.source==='stl'?'本地模型':'内置几何示例')+' · 拖动旋转 · 滚轮缩放';
  el('edit-class').hidden=false;
  el('part-name').value=part.name;
  el('model-category').value=part.category;
  const downloadable=timber || part.source==='mechanical';
  el('sample-info').hidden=!downloadable;
  if(downloadable) {
    el('sample-detail').textContent=part.detail;
    el('sample-download').href='models/'+id+'.stl';
    el('sample-download').download=id+'-'+part.name+'.stl';
  }
  el('model-empty').hidden=false;
  el('model-empty').textContent='正在读取模型…';
  el('reset-camera').disabled=true;
  el('orthos').replaceChildren();
  for(const [group,directions] of Object.entries(groups)) {
    const available=directions.filter(mode=>viewLines(part,mode)?.length);
    if(!available.length) continue;
    const section=document.createElement('details'), title=document.createElement('summary');
    section.open=true;
    title.textContent=modeNames[group]+' · '+available.length+' 个视角';
    const gallery=document.createElement('div');gallery.className='orthos';
    for(const mode of available) {
      const lines=viewLines(part,mode);
      const fig=document.createElement('figure'), canvas=document.createElement('canvas'), cap=document.createElement('figcaption');
      canvas.width=200;canvas.height=140;
      cap.textContent=modeNames[mode];
      draw(canvas,fit(lines,200,140,.84),1.8);
      const use=document.createElement('button');
      use.className='replay';use.textContent='用此线稿检索';
      use.onclick=()=>loadSketch(lines,group,stockCategory===part.category ? part.category : '');
      fig.append(canvas,cap,use);gallery.append(fig);
    }
    section.append(title,gallery);el('orthos').append(section);
  }
  try {
    const mesh=sessionMeshes.get(id) || await requestValue(modelDB.transaction('meshes').objectStore('meshes').get(id));
    if(selectedId!==id) return;
    if(!mesh) throw new Error('模型数据缺失');
    stockViewer.setMesh(mesh,timber);
    el('model-empty').hidden=true;
    el('reset-camera').disabled=false;
    stockViewer.resetCamera();
  } catch(error) {
    if(selectedId===id) el('model-empty').textContent='读取失败：'+error.message;
  }
}
el('reset-camera').onclick=stockViewer.resetCamera;
el('warehouse-tab').onclick=()=>{
  switchView('warehouse');
  browseStock();
};
if(location.hash==='#warehouse') switchView('warehouse');
el('save-category').onclick=async()=>{
  const part=modelCatalog.get(selectedId);
  if(!part) return;
  const category=el('model-category').value;
  el('save-category').disabled=true;
  try {
    const name=el('part-name').value.trim();
    if(!name) throw new Error('请输入零件名称');
    PartCategories.savePart(part.id,name,category);
    part.name=name;
    part.category=category;
    updateCatalog();
    if(selectedId===part.id && !el('warehouse').hidden) await openStoredModel(part.id);
    el('store-status').textContent=part.name+' 已保存至'+category+'。';
  } catch(error) {
    el('store-status').textContent='零件信息保存失败：'+error.message;
  } finally {el('save-category').disabled=false;}
};
function lockImport(value) {
  el('import-model').disabled=value;
}
function modelPart(id,name,vertices,source) {
  const part={id,name,source};
  for(const view of [...groups.plane,...groups.solid]) {
    part[view==='front'?'strokes':view]=ModelMesh.outline(vertices,view);
  }
  return part;
}
async function importModel(file) {
  lockImport(true);
  try {
    const name=file.name.replace(/\.stl$/i,'');
    const id=el('model-id').value.trim() || name;
    if(byId.has(id)) {
      throw new Error('编号已存在，请填写另一个编号');
    }
    if(file && file.size>12*1024*1024) throw new Error('请导入 12 MB 以内的 STL');
    const category=el('import-category').value;
    el('store-status').textContent='正在提取模型轮廓…';
    const vertices=ModelMesh.parse(await file.arrayBuffer());
    const part=modelPart(id,name,vertices,'stl');
    part.category=category;
    part.categoryKey=PartCategories.keyFor(category);
    if([part.strokes,part.left,part.top].some(lines=>!lines.length)) throw new Error('模型需要在三个坐标平面上都有可见投影');
    if(modelDB) {
      await new Promise((resolve,reject)=>{
        const tx=modelDB.transaction(['parts','meshes'],'readwrite');
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error || new Error('本地写入中断'));
        tx.objectStore('parts').add(part);tx.objectStore('meshes').add(vertices,id);
      });
    } else sessionMeshes.set(id,vertices);
    registerModel(part);
    updateCatalog();
    if(file) el('model-id').value='';
    el('store-status').textContent=modelDB ? '已保存在本浏览器，并加入草图检索。' : '本地存储不可用，模型仅在本次打开期间保留。';
    await openStoredModel(id);
  } catch(error) {
    el('store-status').textContent='导入失败：'+error.message;
  } finally { lockImport(false); }
}
el('import-model').onclick=()=>el('model-file').click();
el('model-file').onchange=e=>{
  const file=e.target.files[0];e.target.value='';
  if(file) importModel(file);
};

const warehouseReady = (async ()=>{
  lockImport(true);
  try {
    const req=indexedDB.open('sketch-parts-warehouse',1);
    req.onupgradeneeded=()=>{
      req.result.createObjectStore('parts',{keyPath:'id'});
      req.result.createObjectStore('meshes');
    };
    modelDB=await requestValue(req);
    const stored=await requestValue(modelDB.transaction('parts').objectStore('parts').getAll());
    for(const part of stored) {
      const missing=groups.solid.filter(view=>!part[view]);
      if(missing.length) {
        const mesh=await requestValue(modelDB.transaction('meshes').objectStore('meshes').get(part.id));
        if(mesh) {
          for(const view of missing) part[view]=ModelMesh.outline(mesh,view);
          // Cache derived views when storage space permits; the mesh remains authoritative.
          try {
            await requestValue(modelDB.transaction('parts','readwrite').objectStore('parts').put(part));
          } catch { /* The in-memory outlines remain available for this session. */ }
        }
      }
      registerModel(part);
    }
  } catch {
    modelDB=null;
    el('store-status').textContent='此浏览器的本地存储不可用，仍可在本次打开期间导入。';
  } finally {
    for(const part of byId.values()) if(!modelCatalog.has(part.id)) PartCategories.apply(part);
    for(const model of [...MechanicalModels,...TimberModels]) {
      if(byId.has(model.id)) continue;
      const mesh=ModelMesh.normalize(model.mesh());
      const part=modelPart(model.id,model.name,mesh,model.family?'timber':'mechanical');
      part.category=model.category;
      if(model.family) part.family='古建筑 '+model.family;
      part.detail=model.detail;
      sessionMeshes.set(model.id,mesh);
      registerModel(part);
    }
    for(const [id,name,shape,category] of [['DEMO-L','直角支架','angle','支架类'],['DEMO-B','垫块','block','规则块体'],['DEMO-W','斜楔','wedge','基础类']]) {
      if(byId.has(id)) continue;
      const mesh=ModelMesh.example(shape);
      sessionMeshes.set(id,mesh);
      registerModel({...modelPart(id,name,mesh,'sample'),category});
    }
    updateCatalog();lockImport(false);
    if(!el('warehouse').hidden && !selectedId) browseStock();
  }
})();

async function saveGeneratedModel(id, type, params, sketch, raw, profile, repairs, recipe, cadName) {
  await warehouseReady;
  if (!modelDB) throw new Error('浏览器本地存储不可用，可下载 STL 保留模型');
  const editing = Boolean(id);
  if (editing && modelCatalog.get(id)?.source !== 'parametric') throw new Error('无法更新此模型');
  if (!editing) id = 'GEN-' + crypto.randomUUID();
  const mesh = ModelMesh.normalize(raw);
  const part = modelPart(id, type==='free'?'自由轮廓板':Parametric.types[type], mesh, 'parametric');
  if(recipe) Object.assign(part,{recipe,name:cadName});
  if(type==='free') Object.assign(part,{profile,repairs});
  Object.assign(part, {type, params, sketch, category: ['flat','boss'].includes(type) ? '盘环类' : '板类'});
  part.categoryKey=part.category;
  PartCategories.apply(part);
  if ([part.strokes,part.left,part.top].some(lines => !lines.length)) throw new Error('投影过小，无法建立检索轮廓，请核对模型比例');
  await new Promise((resolve,reject) => {
    const tx = modelDB.transaction(['parts','meshes'], 'readwrite');
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error('本地写入中断'));
    const method = editing ? 'put' : 'add';
    tx.objectStore('parts')[method](part);
    tx.objectStore('meshes')[method](mesh, id);
  });
  if (editing) {
    SketchMatcher.replacePart(part);
    byId.set(id,part);
    modelCatalog.set(id,part);
  } else registerModel(part);
  updateCatalog();
  return id;
}

function saveCadPart(name,raw,recipe,id) {
  return saveGeneratedModel(id,'cad',{},[],raw,undefined,undefined,recipe,name);
}
el('edit-parameters').addEventListener('click',event=>{
  const part=modelCatalog.get(selectedId);
  if(part?.recipe) {
    event.stopImmediatePropagation();
    window.openCadRecipe(part);
  }
},true);
