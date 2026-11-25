'use strict';

(() => {
  const dialog=el('builder'), selector=el('builder-type'), fields=el('builder-fields');
  const status=el('builder-status'), download=el('builder-export'), save=el('builder-save');
  const viewer=createMeshViewer(el('builder-view'));
  let id, sketch, estimate, raw, params, profile, profileError, saving=false;
  let repairs;
  selector.add(new Option('自由轮廓拉伸','free'));
  const templates=document.createElement('optgroup');
  templates.label='零件模板';
  selector.append(templates);
  for(const [type,label] of Object.entries(Parametric.types)) templates.append(new Option(label,type));

  function previewSketch() {
    const canvas=el('builder-sketch'), ctx=canvas.getContext('2d');
    const free=selector.value==='free';
    const marks=free?profileError?.points || []:[];
    const filled=free && profile;
    const lines=filled?profile:sketch;
    const bridges=filled?repairs.bridges:[],tails=filled?repairs.tails:[];
    const overlays=[...bridges,...tails];
    const geometry=[...lines,...overlays];
    const fitted=fit(marks.length?[...geometry,marks]:geometry,canvas.width,canvas.height,.84);
    const markers=marks.length?fitted.pop():[];
    const overlayLines=fitted.splice(lines.length);
    canvas.classList.toggle('profile',free);
    draw(canvas,fitted,2);
    if(filled) {
      ctx.beginPath();
      for(const line of fitted) {
        ctx.moveTo(...line[0]);
        for(const p of line.slice(1)) ctx.lineTo(...p);
        ctx.closePath();
      }
      ctx.fillStyle='#a7ba9b';ctx.fill('evenodd');ctx.stroke();
      overlayLines.forEach((line,i)=>{
        const bridge=i<bridges.length;
        ctx.strokeStyle=bridge?'#b34516':'#9ca59d';
        ctx.lineWidth=bridge?3:2;ctx.setLineDash(bridge?[]:[4,3]);
        ctx.beginPath();ctx.moveTo(...line[0]);for(const p of line.slice(1)) ctx.lineTo(...p);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }
    ctx.strokeStyle='#b33c21';ctx.lineWidth=3;
    for(const p of markers) {ctx.beginPath();ctx.arc(...p,6,0,Math.PI*2);ctx.stroke();}
    el('builder-caption').textContent=filled?['填色部分将生成实体',bridges.length?'橙线为补线':'',tails.length?'灰虚线为裁去的出头':''].filter(Boolean).join(' · '):markers.length?'红圈标出待修正位置':'原始草图';
  }

  function rebuild() {
    raw=null;
    params={};
    for(const input of fields.querySelectorAll('input')) {
      input.removeAttribute('aria-invalid');
      params[input.name]=input.valueAsNumber;
      input.parentElement.querySelector('.field-error').textContent='';
    }
    try {
      if(selector.value==='free') {
        if(profileError) throw profileError;
        raw=Parametric.extrude(profile,FreeProfile.extent(profile[0]),params.width,params.T);
      } else raw=Parametric.generate(selector.value,params);
      viewer.setMesh(raw ? ModelMesh.normalize(raw) : null);
      status.textContent=raw?'尺寸单位为毫米。核对后可下载或入库。':'请选择模板。';
    } catch(error) {
      raw=null;
      viewer.setMesh(null);
      status.textContent=error.message;
      const input=fields.querySelector('input[name="'+error.key+'"]');
      if(input) {
        input.setAttribute('aria-invalid','true');
        input.parentElement.querySelector('.field-error').textContent=error.message;
      }
    }
    el('builder-cad').disabled=download.disabled=save.disabled=!raw;
    el('builder-reset').disabled=!raw;
  }

  function renderFields(saved) {
    fields.replaceChildren();
    const type=selector.value;
    const free=type==='free';
    el('builder-hint').textContent=free?'外圈确定板形，内圈形成通孔。整体宽度按草图的水平方向计算。':estimate.hint;
    previewSketch();
    if(type) {
      const specs=free?[{key:'width',label:'整体宽度（mm）',default:profile ? FreeProfile.extent(profile[0]).width*SketchShapes.mmPerUnit : 100},{key:'T',label:'厚度（mm）',default:8}]:Parametric.fields(type);
      const base=specs[0].default;
      const useEstimate=estimate.type===type || (['boss','flat'].includes(estimate.type) && ['boss','flat'].includes(type));
      for(const spec of specs) {
        const label=document.createElement('label'), input=document.createElement('input');
        const tag=document.createElement('small'), error=document.createElement('small');
        const ratio=useEstimate ? estimate.ratios[spec.key] : undefined;
        input.name=spec.key;
        input.type='number';
        input.step=spec.key==='N'?'1':'any';
        input.value=saved?.[spec.key] ?? (ratio===undefined ? spec.default : spec.key==='N' ? ratio : Math.round(ratio*base*10)/10);
        tag.textContent=!saved && free?'默认值':!saved && ratio!==undefined?'草图估算':'';
        error.className='field-error';
        error.id='builder-error-'+spec.key;
        input.setAttribute('aria-describedby',error.id);
        label.append(spec.label,tag,input,error);
        input.oninput=()=>{tag.textContent='';rebuild();};
        fields.append(label);
      }
    }
    rebuild();
  }
  selector.onchange=()=>renderFields();

  function open(lines,recommendation,part,mode='plane') {
    sketch=lines;estimate=recommendation;id=part?.id;
    profile=null;profileError=null;repairs={bridges:[],tails:[]};
    try {
      if(mode!=='plane') throw new Error('请返回画板，切换到平面图并绘制要拉伸的截面。');
      if(part?.profile) {
        profile=part.profile;
        repairs=part.repairs || repairs;
      } else {
        const {rings,bridges,tails}=FreeProfile.repair(lines);
        profile=rings;repairs={bridges,tails};
      }
    } catch(error) {profileError=error;}
    selector.value=part?.type || 'free';
    el('builder-close').textContent=part?'返回仓库':'返回画板';
    save.textContent=part?'保存修改':'保存到仓库';
    el('builder-sketch').parentElement.hidden=!lines.length;
    renderFields(part?.params);
    viewer.resetCamera();
    dialog.showModal();
  }
  el('build-sketch').onclick=()=>{
    const lines=editingLeft?frontQuery.strokes:strokes;
    open(lines,inferSketch(lines,queryMode,editingLeft?strokes:null),undefined,queryMode);
  };
  el('edit-parameters').onclick=()=>{
    const part=modelCatalog.get(selectedId);
    if(part?.source==='parametric') open(part.sketch,{type:part.type,ratios:{},hint:'正在编辑已入库模型。保存后会更新此编号的尺寸和检索轮廓。'},part);
  };
  dialog.oncancel=event=>{if(saving) event.preventDefault();};
  el('builder-close').onclick=()=>dialog.close();
  el('builder-reset').onclick=viewer.resetCamera;
  el('builder-cad').onclick=()=>{
    if(!raw) return;
    dialog.close();
    window.openCadBase({kind:'base',type:selector.value,params:{...params},profile,sketch},selector.selectedOptions[0].text);
  };
  download.onclick=()=>{
    if(!raw) return;
    const url=URL.createObjectURL(new Blob([Parametric.stl(raw)],{type:'application/octet-stream'}));
    const link=document.createElement('a');
    link.href=url;link.download=selector.selectedOptions[0].text+'-'+(id || 'mm')+'.stl';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
  save.onclick=async()=>{
    if(!raw || saving) return;
    saving=true;
    const controls=[save,download,selector,el('builder-close'),...fields.querySelectorAll('input')];
    controls.forEach(control=>control.disabled=true);
    try {
      id=await saveGeneratedModel(id,selector.value,params,sketch,raw,profile,repairs);
      dialog.close();
      await openStoredModel(id);
      el('store-status').textContent='已保存，可继续编辑参数或使用线稿检索。';
    } catch(error) {
      status.textContent='保存失败：'+error.message;
    } finally {
      saving=false;
      controls.forEach(control=>control.disabled=false);
    }
  };
})();
