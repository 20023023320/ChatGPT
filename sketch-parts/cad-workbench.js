'use strict';

(() => {
  const page=el('cad');
  page.innerHTML=`<div class="heading"><div><h1 id="cad-title">CAD 工作台</h1><p>绘制截面，拉伸实体，或选择两个面粘连草稿。</p></div></div>
    <div class="cad-bar"><button id="cad-use-sketch">使用画板草图</button><button id="cad-glue">粘连</button><button id="cad-new">新建草稿</button><label>名称 <input id="cad-name" maxlength="60"></label><button id="cad-store">保存草稿</button><button id="cad-delete">删除草稿</button></div>
    <div class="cad-tabs"><button data-pane="edit">工具</button><button data-pane="model">实体</button><button data-pane="library">草稿</button></div><div class="cad-grid"><section class="cad-edit panel"><h3>特征历史</h3><select size="1" id="cad-history" aria-label="编辑特征"></select><button id="cad-append">添加特征</button><button id="cad-remove">删除此步</button>
    <label>特征 <select id="cad-kind"><option value="extrude">草图拉伸</option><option value="join">贴合两个草稿</option><option value="base" disabled>基础模型</option></select></label><div id="cad-base"></div>
    <div id="cad-extrude"><label>草图平面 <select id="cad-plane"></select></label><canvas id="cad-pad" width="480" height="300" aria-label="绘制截面"></canvas><p class="note">十字为平面原点，每格 10 mm。画完按住半秒整形，继续拖动可缩放。</p><button id="cad-undo">撤销 (Ctrl+Z)</button><button id="cad-clear">清空轮廓</button>
        <fieldset><legend>精确轮廓（mm）</legend><label>编辑对象 <select id="cad-loop"></select></label><label>形状 <select id="cad-shape"><option value="circle">圆</option><option value="rectangle">矩形</option><option value="ellipse">椭圆</option><option value="square">正方形</option><option value="line">直线</option><option value="triangle">三角形</option></select></label>
    <label>中心 X <input id="cad-x" type="number" step="any" value="0"></label><label>中心 Y <input id="cad-y" type="number" step="any" value="0"></label><label>宽度 / 圆直径 <input id="cad-w" type="number" step="any" value="20"></label><label>高度 <input id="cad-h" type="number" step="any" value="20"></label><label>角度 ° <input id="cad-rotation" type="number" value="0" step="any"></label><button id="cad-draw">写入轮廓</button></fieldset>
    <label>距离（mm，可为负）<input type="number" id="cad-distance" step="any"></label><label>运算 <select id="cad-op"><option value="new">新建实体</option><option value="union">并集 · 加料</option><option value="subtract">差集 · 切除</option><option value="intersect">交集</option></select></label></div>
    <div id="cad-join"><label>待贴合草稿 <select id="cad-tool"></select></label><label>目标面 <select id="cad-target"></select></label><label>工具面 <select id="cad-toolface"></select></label>
    <canvas id="cad-toolview" width="420" height="270" aria-label="点选工具面"></canvas>
    <label>面内 X（mm）<input id="cad-dx" type="number" step="any"></label><label>面内 Y（mm）<input id="cad-dy" type="number" step="any"></label><label>旋转角（°）<input id="cad-angle" type="number" step="any"></label></div>
    <button id="cad-revert" hidden>放弃待修正的更改</button><button id="cad-preview">预览贴合</button><button id="cad-apply" class="primary">应用特征</button></section><section class="cad-model panel"><h3>实体预览 <button id="cad-axes" aria-pressed="false">XYZ 坐标轴</button></h3><canvas id="cad-view" width="720" height="480" aria-label="拖动旋转或点选目标平面"></canvas><p id="cad-status" role="status"></p><button id="cad-export">下载 STL</button><button id="cad-save" class="primary">保存到仓库</button></section><aside class="cad-library panel"><h3>草稿</h3><div id="cad-cards"></div><button id="cad-insert">放入实体区</button><button id="cad-load">打开草稿</button></aside></div>`;
  const ui=id=>document.getElementById('cad-'+id);
  ui('glue').after(ui('undo'));
  ui('use-sketch').replaceWith(el('build-sketch'));
  el('build-sketch').hidden=false;
  const viewer=createMeshViewer(ui('view')), toolViewer=createMeshViewer(ui('toolview'));
  const pad=ui('pad'),ctx=pad.getContext('2d'), scale=SketchShapes.mmPerUnit;
  const point=([x,y])=>[(x-240)*scale,(150-y)*scale];
  const pixel=([x,y])=>[240+x/scale,150-y/scale];
  const status=msg=>ui('status').textContent=msg;
  const prefix='sketchparts.cad.draft.';
  ui('axes').onclick=()=>{
    const enabled=ui('axes').getAttribute('aria-pressed')!=='true';
    ui('axes').setAttribute('aria-pressed',String(enabled));viewer.setAxes(enabled);
  };
  const undo=[];
  const controls=()=>[...page.querySelectorAll('.cad-edit input,.cad-edit select')].filter(e=>e.id!=='cad-history');
  function capture(){
    return {recipe,previousRecipe,draftId,sourceId,index,name:ui('name').value,lines:structuredClone(lines),
      controls:controls().map(e=>[e.id||e.name,e.value])};
  }
  function remember(state){
    undo.push(state);if(undo.length>60)undo.shift();ui('undo').disabled=false;
  }
  function undoEdit(){
    if(active!==null||!undo.length)return;
    const state=undo.pop();
    ({recipe,previousRecipe,draftId,sourceId}=state);
    raw=CadGeometry.build(previousRecipe||recipe);
    ui('name').value=state.name;edit(state.index);lines=state.lines;listLoops();
    const values=new Map(state.controls);
    for(const control of controls())if(values.has(control.id||control.name)){
      control.value=values.get(control.id||control.name);
      if(control===ui('tool'))toolChange();
    }
    mode();paint();ui('undo').disabled=!undo.length;status('已撤销上一步。');
  }
  page.addEventListener('keydown',e=>{
    if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='z'&&!e.target.matches('input,textarea,[contenteditable=true]')){
      e.preventDefault();undoEdit();
    }
  });
  let previousRecipe,recipe,sourceId,draftId,raw,index,lines=[],active=null,faces=[],toolFaces=[],toolRecipe,toolOptions=[],showingPrefix=false;
  const opts=(id,entries,value)=>{
    const select=ui(id);
    select.replaceChildren(...entries.map(([key,label])=>new Option(label,key)));
    if(value!=null) {
      if(!entries.some(([key])=>String(key)===String(value))) select.add(new Option('原平面失效，请重新选择',value));
      select.value=value;
    }
  };
  function drafts(){
    return Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>JSON.parse(localStorage.getItem(k)));
  }
  let selectedCard;
  const pane=name=>{page.dataset.pane=name;};
  pane('edit');
  for(const tab of page.querySelectorAll('[data-pane]'))tab.onclick=()=>pane(tab.dataset.pane);
  function refreshDrafts(){
    const saved=drafts(), cards=ui('cards');
    if(!saved.some(d=>d.id===selectedCard)) selectedCard=draftId||saved[0]?.id;
    cards.replaceChildren();
    for(const draft of saved){
      const card=document.createElement('button'),canvas=document.createElement('canvas');
      canvas.width=140;canvas.height=78;card.type='button';card.draggable=true;
      card.dataset.id=draft.id;card.setAttribute('aria-pressed',String(draft.id===selectedCard));
      card.append(canvas,document.createTextNode(draft.name));cards.append(card);
      if(draft.recipe.steps.length)display(createMeshViewer(canvas),CadGeometry.build(draft.recipe));
      const select=()=>{
        selectedCard=draft.id;
        for(const item of cards.children)item.setAttribute('aria-pressed',String(item===card));
      };
      card.onclick=select;card.ondragstart=e=>{select();e.dataTransfer.setData('application/x-sketch-draft',draft.id);};
    }
    ui('insert').disabled=ui('load').disabled=!saved.length;
  }
  function listLoops(){
    opts('loop',[['','新增'],...lines.map((_,i)=>[i,'轮廓 '+(i+1)])]);
  }
  ui('loop').onchange=()=>{
    if(ui('loop').value==='')return;
    const ring=lines[Number(ui('loop').value)].map(point),box=FreeProfile.extent(ring);
    ui('x').value=box.left+box.width/2;ui('y').value=box.top+box.height/2;
    ui('w').value=box.width;ui('h').value=box.height;
    const line=lines[Number(ui('loop').value)],shape=line.shape||SketchShapes.recognize(line);
    if(shape){
      ui('shape').value=shape.kind;ui('rotation').value=shape.angle*180/Math.PI;
      ui('w').value=shape.width*scale;ui('h').value=shape.height*scale;
      [ui('x').value,ui('y').value]=point(shape.center);
    }
  };
  ui('draw').onclick=()=>guarded(()=>{
    const kind=ui('shape').value,w=number('w'),h=['circle','square'].includes(kind)?w:kind==='line'?0:number('h'),x=number('x'),y=number('y');
    if(!(w>0&&(kind==='line'||h>0)))throw Error('轮廓尺寸须为正数。');
    const old=ui('loop').value===''?null:lines[Number(ui('loop').value)];
    const original=old&&(old.shape||SketchShapes.recognize(old));
    const local=original?.kind===kind?original.local:kind==='line'?[[-.5,0],[.5,0]]:['rectangle','square'].includes(kind)?[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]:kind==='triangle'?[[0,-.5],[.5,.5],[-.5,.5]]:Array.from({length:96},(_,i)=>[Math.cos(i*Math.PI/48)/2,Math.sin(i*Math.PI/48)/2]);
    const line=SketchShapes.render({kind,local,angle:number('rotation')*Math.PI/180,width:w/scale,height:h/scale,center:pixel([x,y])});
    remember(capture());
    if(ui('loop').value==='')lines.push(line);else lines[Number(ui('loop').value)]=line;
    listLoops();paint();status('轮廓已更新，应用特征后重建实体。');
  });
  function paint(){
    const offset=(pad.width-480)/2;
    ctx.setTransform(1,0,0,1,offset,0);
    ctx.clearRect(-offset,0,pad.width,300);
    const span=Math.ceil(Math.max(pad.width,300)/80);
    for(let i=-span;i<=span;i++){
      ctx.strokeStyle=i?'#d4dbd0':'#889981';ctx.lineWidth=i?1:2;
      ctx.beginPath();ctx.moveTo(240+i*40,0);ctx.lineTo(240+i*40,300);
      ctx.moveTo(-offset,150+i*40);ctx.lineTo(pad.width-offset,150+i*40);ctx.stroke();
    }
    ctx.strokeStyle='#283e35';ctx.lineWidth=2;
    for(const line of lines){
      ctx.beginPath();line.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
    }
  }
  new ResizeObserver(()=>{
    if(!pad.clientHeight)return;
    pad.width=Math.round(300*pad.clientWidth/pad.clientHeight);paint();
  }).observe(pad);
  function location(e){
    const b=pad.getBoundingClientRect();
    return [(e.clientX-b.left-pad.clientLeft)*pad.width/pad.clientWidth-(pad.width-480)/2,
      (e.clientY-b.top-pad.clientTop)*300/pad.clientHeight];
  }
  let timer,anchor,fitShape,beforeStroke,handDrawn;
  function sample(p){
    if(fitShape){
      const radius=q=>Math.hypot(q[0]-fitShape.center[0],q[1]-fitShape.center[1]);
      const ratio=Math.max(.03,radius(p)/Math.max(1,radius(anchor)));
      lines[lines.length-1]=SketchShapes.render({...fitShape,width:fitShape.width*ratio,height:fitShape.height*ratio});
    }else{
      const line=lines.at(-1),last=line.at(-1);
      if(!last||Math.hypot(last[0]-p[0],last[1]-p[1])>=1)line.push(p);
      if(!anchor||Math.hypot(anchor[0]-p[0],anchor[1]-p[1])>=3){
        clearTimeout(timer);anchor=p;
        timer=setTimeout(()=>{
          fitShape=SketchShapes.recognize(line);
          if(fitShape){handDrawn=line;lines[lines.length-1]=SketchShapes.render(fitShape);paint();}
        },500);
      }
    }
    paint();
  }
  pad.onpointerdown=e=>{
    if(active!==null||e.button!==0)return;
    beforeStroke=capture();active=e.pointerId;pad.setPointerCapture(active);
    anchor=fitShape=handDrawn=null;lines.push([]);sample(location(e));
  };
  pad.onpointermove=e=>{if(active===e.pointerId)sample(location(e));};
  pad.onpointerup=pad.onpointercancel=pad.onlostpointercapture=e=>{
    if(active!==e.pointerId)return;
    if(e.type==='pointerup')sample(location(e));
    clearTimeout(timer);active=null;
    if(e.type==='pointerup'&&lines.at(-1).length>1){
      remember(beforeStroke);
      if(handDrawn)remember({...beforeStroke,lines:[...beforeStroke.lines,handDrawn]});
    }
    else lines=beforeStroke.lines;
    listLoops();paint();
    if(e.type==='pointerup'&&fitShape){ui('loop').value=lines.length-1;ui('loop').onchange();}
    beforeStroke=fitShape=null;
  };
  ui('undo').onclick=undoEdit;
  ui('clear').onclick=()=>{if(lines.length)remember(capture());lines=[];listLoops();paint();};
  const opNames={new:'新建实体',union:'加料',subtract:'切除',intersect:'相交'};
  const nameOf=s=>s.kind==='base'?'基础模型':s.kind==='join'?'贴合':opNames[s.op];
  function history(){
    opts('history',recipe.steps.map((s,i)=>[i,(i+1)+'. '+nameOf(s)]));
    ui('history').selectedIndex=index<recipe.steps.length?index:-1;
    ui('remove').disabled=ui('history').selectedIndex<0||!!previousRecipe;
  }
  const display=(v,m)=>v.setMesh(m?.length?ModelMesh.normalize(m):null);
  function selectFace(id,list,v){
    const face=list.find(f=>String(f.id)===ui(id).value);
    v.setHighlight(face?.triangles||[]);
  }
  function toolChange(face){
    toolRecipe=toolOptions.find(t=>t.id===ui('tool').value)?.recipe;
    const mesh=toolRecipe?CadGeometry.build(toolRecipe):null;
    toolFaces=mesh?CadGeometry.faces(mesh):[];
    display(toolViewer,mesh);opts('toolface',toolFaces.map(f=>[f.id,f.label]),face);
    selectFace('toolface',toolFaces,toolViewer);
  }
  function mode(){
    ui('apply').textContent=ui('kind').value==='join'?'确认粘连':'应用特征';
    ui('preview').hidden=ui('kind').value!=='join';
    for(const kind of ['base','extrude','join']) ui(kind).hidden=ui('kind').value!==kind;
    selectFace(ui('kind').value==='join'?'target':'plane',faces,viewer);
  }
  function edit(i,showResult=false){
    index=i;history();
    const step=recipe.steps[i],kind=step?.kind||'extrude';
    ui('kind').value=kind;ui('kind').disabled=!!step;
    const prev=i===recipe.steps.length?raw:i?CadGeometry.build({steps:recipe.steps.slice(0,i)}):null;
    faces=prev?CadGeometry.faces(prev):[];
    showingPrefix=!showResult||i===recipe.steps.length;
    display(viewer,showResult?raw:prev);
    const entries=faces.map(f=>[f.id,f.label]);
    opts('plane',[...['XY','XZ','YZ'].map(p=>[p,p+' 基准面']),...entries],step?.plane);
    opts('target',entries,step?.targetFace);
    ui('op').value=step?.op||(i?'union':'new');ui('distance').value=step?.distance??10;
    lines=step?.rings?.map(r=>[...r,r[0]].map(pixel))||[];listLoops();paint();
    toolOptions=drafts().filter(d=>d.id!==draftId&&d.recipe.steps.length);
    if(step?.tool) toolOptions.unshift({id:'snapshot',name:'已绑定的草稿快照',recipe:step.tool});
    opts('tool',toolOptions.map(d=>[d.id,d.name]));
    toolChange(step?.toolFace);
    for(const k of ['dx','dy','angle']) ui(k).value=step?.[k]??0;
    ui('base').replaceChildren();
    if(kind==='base'&&step.params){
      for(const [key,value] of Object.entries(step.params)){
        const label=document.createElement('label'),input=document.createElement('input');
        label.textContent=step.type==='free'?({width:'整体宽度（mm）',T:'厚度（mm）'}[key]||key):(Parametric.fields(step.type).find(f=>f.key===key)?.label||key);
        input.type='number';input.step='any';input.value=value;input.name=key;label.append(input);ui('base').append(label);
      }
    }
    mode();if(!showingPrefix)viewer.setHighlight([]);
    ui('export').disabled=!raw;
    ui('save').disabled=!raw||!!previousRecipe;
    ui('store').disabled=!!previousRecipe;
    ui('append').disabled=!!previousRecipe;
    ui('revert').hidden=!previousRecipe;
  }
  function pick(n,list,id,v){
    if(v===viewer&&!showingPrefix)return;
    const face=list.find(f=>f.triangles.includes(n));
    if(face){ui(id).value=face.id;selectFace(id,list,v);}
  }
  viewer.onFacePick(n=>pick(n,faces,ui('kind').value==='join'?'target':'plane',viewer));
  toolViewer.onFacePick(n=>pick(n,toolFaces,'toolface',toolViewer));
  ui('kind').onchange=mode;ui('plane').onchange=()=>selectFace('plane',faces,viewer);
  ui('target').onchange=()=>{
    if(!showingPrefix){
      display(viewer,CadGeometry.build({steps:recipe.steps.slice(0,index)}));showingPrefix=true;
    }
    selectFace('target',faces,viewer);
  };
  ui('toolface').onchange=()=>selectFace('toolface',toolFaces,toolViewer);
  ui('tool').onchange=()=>toolChange();
  function number(id){const n=ui(id).valueAsNumber;if(!Number.isFinite(n))throw Error('请填写有效尺寸。');return n;}
  function currentStep(){
    const kind=ui('kind').value;
    if(kind==='base'){
      const step=structuredClone(recipe.steps[index]);
      for(const input of ui('base').querySelectorAll('input'))step.params[input.name]=input.valueAsNumber;
      return step;
    }
    if(kind==='join'){
      if(!toolRecipe||!ui('target').value||!ui('toolface').value)throw Error('请选择两个草稿的贴合面。');
      return {kind,tool:toolRecipe,targetFace:ui('target').value,toolFace:ui('toolface').value,dx:number('dx'),dy:number('dy'),angle:number('angle')};
    }
    const rings=FreeProfile.repair(lines).rings.map(r=>r.map(point));
    return {kind,rings,plane:ui('plane').value,distance:number('distance'),op:ui('op').value};
  }
  ui('preview').onclick=()=>guarded(()=>{
    const next={steps:recipe.steps.slice()};next.steps[index]=currentStep();
    display(viewer,CadGeometry.build(next));showingPrefix=false;status('贴合预览。应用特征后生成合并草稿。');
  });
  ui('apply').onclick=()=>{
    const next={...recipe,steps:recipe.steps.slice()};
    try{
      next.steps[index]=currentStep();
      const result=CadGeometry.build(next);
      if(!result?.length)throw Error('运算后没有实体。');
      remember(capture());
      if(next.steps[index].kind==='join'&&index===recipe.steps.length){
        draftId=null;sourceId=undefined;ui('name').value+=' · 合并';refreshDrafts();
      }
      previousRecipe=null;recipe=next;raw=result;edit(recipe.steps.length,true);status('特征已应用。选择历史特征可修改尺寸。');
    }catch(e){
      if(e.stepIndex>index){
        remember(capture());
        previousRecipe ||= recipe;
        recipe=next;
        edit(e.stepIndex);
        status(e.message+' 请在当前预览中重新选择平面或调整此特征，再应用。');
      }else{
        display(viewer,raw);showingPrefix=false;status('无法应用，保留上次成功的实体。'+e.message);
      }
    }
  };
  ui('revert').onclick=()=>{
    recipe=previousRecipe;previousRecipe=null;edit(recipe.steps.length,true);status('已恢复上次成功的特征历史。');
  };
  ui('append').onclick=()=>edit(recipe.steps.length);
  ui('remove').onclick=()=>{
    if(index>=recipe.steps.length||previousRecipe)return;
    const next={...recipe,steps:recipe.steps.filter((_,i)=>i!==index)};
    let result;
    try{result=CadGeometry.build(next);}catch(e){
      status('后续特征依赖此步，请先修改或删除依赖特征。'+e.message);return;
    }
    remember(capture());recipe=next;raw=result;edit(next.steps.length,true);status('已删除特征。Ctrl+Z 可恢复。');
  };
  ui('history').onchange=()=>{if(previousRecipe){history();return;}edit(ui('history').selectedIndex);status('正在编辑特征，显示该步骤之前的实体。');};
  function open(data){
    undo.length=0;ui('undo').disabled=true;
    previousRecipe=null;recipe=structuredClone(data.recipe);sourceId=data.sourceId;draftId=data.id;
    raw=recipe.steps.length?CadGeometry.build(recipe):null;
    ui('name').value=data.name||'未命名草稿';refreshDrafts();edit(recipe.steps.length,true);
    status('选择基准面或点击实体平面，然后绘制截面。');
    switchView('cad');viewer.resetCamera();
  }
  function guarded(fn){try{fn();}catch(e){status(e.message);}}
  el('cad-tab').onclick=ui('open').onclick=()=>guarded(()=>{if(recipe)switchView('cad');else open({recipe:{steps:[]}});});
  ui('new').onclick=()=>guarded(()=>open({recipe:{steps:[]}}));
  const selectedDraft=()=>drafts().find(d=>d.id===selectedCard);
  ui('load').onclick=()=>guarded(()=>{const d=selectedDraft();if(d){open(d);pane('model');}});
  function insert(id){
    const d=drafts().find(d=>d.id===id);
    if(!d?.recipe.steps.length)throw Error('请选择含有实体的草稿。');
    if(!raw){open(d);pane('model');return;}
    if(previousRecipe)throw Error('请先修正当前特征。');
    if(id===draftId)throw Error('请选择另一份草稿。');
    edit(recipe.steps.length);
    ui('kind').value='join';mode();ui('tool').value=id;toolChange();pane('edit');
    status('分别点选实体和草稿的粘合面，预览位置后确认粘连。');
  }
  ui('insert').onclick=()=>guarded(()=>insert(selectedCard));
  const target=ui('view');
  target.ondragover=e=>{if(e.dataTransfer.types.includes('application/x-sketch-draft'))e.preventDefault();};
  target.ondrop=e=>{e.preventDefault();guarded(()=>insert(e.dataTransfer.getData('application/x-sketch-draft')));};
  ui('glue').onclick=()=>guarded(()=>{
    const d=selectedDraft();
    if(!raw)throw Error('请先放入目标实体，再选择另一份草稿粘连。');
    insert(d?.id!==draftId && d ? d.id : drafts().find(x=>x.id!==draftId&&x.recipe.steps.length)?.id);
  });

  ui('export').onclick=()=>{
    if(!raw)return;
    const url=URL.createObjectURL(new Blob([Parametric.stl(raw)],{type:'application/octet-stream'})),link=document.createElement('a');
    link.href=url;link.download=(ui('name').value.trim()||'CAD')+'.stl';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
  ui('delete').onclick=()=>guarded(()=>{
    if(!draftId){status('请选择已保存的草稿。');return;}
    if(confirm('删除当前草稿？引用此草稿的贴合特征会保留原快照。')){
      localStorage.removeItem(prefix+draftId);open({recipe:{steps:[]}});status('草稿已删除。');
    }
  });
  ui('store').onclick=()=>guarded(()=>{
    const id=draftId||crypto.randomUUID(),name=ui('name').value.trim()||'未命名草稿';
    localStorage.setItem(prefix+id,JSON.stringify({id,name,sourceId,recipe}));draftId=id;selectedCard=id;refreshDrafts();status('草稿已保存在此浏览器。');
  });
  ui('save').onclick=async()=>{
    ui('save').disabled=true;
    try{sourceId=await window.saveCadPart(ui('name').value.trim()||'未命名零件',raw,recipe,sourceId);status('已保存到仓库。');}
    catch(e){status(e.message);}finally{ui('save').disabled=false;}
  };
  window.openCadBase=(base,name)=>open({name,recipe:{steps:[base]}});
  window.openCadRecipe=part=>open({name:part.name,sourceId:part.id,recipe:part.recipe});
})();
