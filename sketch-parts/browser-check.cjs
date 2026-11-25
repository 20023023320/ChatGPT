'use strict';
// Run with: node browser-check.cjs PATH_TO_CHROMIUM
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function test(){
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'sketch-browser-'));
  const child=spawn(process.argv[2],['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws;
  try{
    let port;
    for(let i=0;i<100&&!port;i++){
      try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/)[0];}catch{await pause(100);}
    }
    const response=await fetch('http://127.0.0.1:'+port+'/json/list');
    const page=(await response.json()).find(t=>t.type==='page');
    ws=new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    const pending=new Map();let seq=0;
    ws.onmessage=e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);pending.delete(m.id);};
    function call(method,params){
      const id=++seq;
      return new Promise(resolve=>{pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
    }
    async function evaluate(expression){
      const {result,error}=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if(error||result.exceptionDetails)throw Error(JSON.stringify(error||result.exceptionDetails));
      return result.result.value;
    }
    await call('Page.navigate',{url:pathToFileURL(path.join(__dirname,'index.html')).href});
    for(let i=0;i<100;i++){if(await evaluate("typeof warehouseReady!=='undefined' && !!document.getElementById('cad')"))break;await pause(100);}
    await evaluate('warehouseReady.then(()=>true)');
    for(const width of [1366,1024,390]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:768,deviceScaleFactor:1,mobile:false});
      const layout=await evaluate(`(()=>{
        el('work-tab').click();
        const list=el('parts'),board=el('pad').closest('.panel'),refs=list.closest('.panel');
        list.scrollTop=80;
        const equal=Math.abs(board.offsetHeight-refs.offsetHeight)<=1,scrolls=list.scrollTop>0;
        el('warehouse-tab').click();
        const panels=[...document.querySelectorAll('.store-layout>.panel')].map(p=>p.getBoundingClientRect());
        const columns=panels[2].left>=panels[1].right && panels[1].left>=panels[0].right;
        return {equal,scrolls,columns,fits:document.documentElement.scrollWidth<=innerWidth,
          wide:el('warehouse').offsetWidth>=document.documentElement.clientWidth-25};
      })()`);
      assert.deepEqual(layout,{equal:true,scrolls:true,columns:width>760,fits:true,wide:true});
    }
    assert.deepEqual(await evaluate("[...document.querySelectorAll('nav button')].map(b=>b.id)"),['work-tab','cad-tab','warehouse-tab','checks-tab']);
    await call('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
    for(const [tab,page] of [['work-tab','workspace'],['cad-tab','cad'],['warehouse-tab','warehouse'],['checks-tab','checks']]){
      const aligned=await evaluate(`(()=>{
        el('${tab}').click();
        const page=el('${page}'),title=page.querySelector('h1').getBoundingClientRect(),note=page.querySelector('.heading p').getBoundingClientRect();
        return !page.hidden && note.left>=title.right && note.top<title.bottom;
      })()`);
      assert.ok(aligned,'标题与说明并排：'+page);
    }
    assert.equal(await evaluate("el('checks-tab').click();!el('history-empty').hidden && el('records').children.length===0"),true);
    await evaluate("el('work-tab').click();el('try-flange').click()");
    assert.equal(await evaluate("!el('prompt').hidden && frontQuery.ranking.slice(0,2).every(({id})=>el('prompt-text').textContent.includes(byId.get(id).name))"),true);
    assert.equal(await evaluate(`(async()=>{
      el('add-left').click();el('try-flat').click();el('checks-tab').click();
      const count=recentSearches.length;el('records').querySelector('button').click();
      const pictures=[...el('history-images').querySelectorAll('img')];await Promise.all(pictures.map(p=>p.decode()));
      const ok=el('history-review').open&&pictures.length===2&&pictures[0].src!==pictures[1].src&&recentSearches.length===count;
      el('history-review').close();el('work-tab').click();return ok;
    })()`),true);
    await call('Page.reload',{});await pause(500);
    assert.equal(await evaluate(`(async()=>{
      await warehouseReady;el('checks-tab').click();
      const entry=recentSearches[0],count=recentSearches.length;
      el('records').querySelector('button').click();el('history-edit').click();
      if(!editingLeft||recentSearches.length!==count||JSON.stringify(SketchEraser.serialize(strokes))!==JSON.stringify(entry.leftPen))return false;
      el('edit-front').click();if(JSON.stringify(SketchEraser.serialize(strokes))!==JSON.stringify(entry.pen))return false;
      strokes=[...strokes,[[100,100],[120,120]]];edited();refreshPad();
      el('add-left').click();el('search').click();
      window.scrollTo(0,200);
      const pinned=window.scrollY>0&&document.querySelector('body>header').getBoundingClientRect().top===0;
      window.scrollTo(0,0);
      return pinned&&recentSearches[0].pen.length===entry.pen.length+1&&JSON.stringify(recentSearches[0].leftPen)===JSON.stringify(entry.leftPen);
    })()`),true);
    await evaluate("for(let i=0;i<6;i++)el('try-case').click();el('checks-tab').click()");
    assert.equal(await evaluate("el('records').children.length===6 && recentSearches.every(item=>item.first.includes('PL-01')) && recentSearches.every((item,i)=>!i||item.time<=recentSearches[i-1].time)"),true);
    await call('Page.reload',{});await pause(500);
    assert.equal(await evaluate("el('checks-tab').click();el('cad-tab').click();!el('cad').hidden && el('cad-tab').getAttribute('aria-current')==='page' && el('records').children.length===6"),true);
    await evaluate("el('work-tab').click()");
    const box=await evaluate("(()=>{pad.scrollIntoView({block:'center'});const b=pad.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,r:Math.min(b.width,b.height)/4};})()");
    const mouse=(type,x,y)=>call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1});
    await mouse('mousePressed',box.x+box.r,box.y);
    for(let i=1;i<=64;i++) await mouse('mouseMoved',box.x+box.r*Math.cos(i*Math.PI/32),box.y+box.r*Math.sin(i*Math.PI/32));
    await pause(650);
    assert.equal(await evaluate('snapped?.kind'),'circle');
    await mouse('mouseMoved',box.x+box.r*1.15,box.y);
    await mouse('mouseReleased',box.x+box.r*1.15,box.y);
    assert.equal(await evaluate("el('shape-width').value=20;el('shape-apply').click();selectedShape.shape.width*SketchShapes.mmPerUnit"),20);
    assert.equal(await evaluate("el('undo').click();selectedShape.shape.kind"),'circle');
    const cadBox=await evaluate("(()=>{el('cad-open').click();const b=el('cad-pad').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,rx:b.height*.32,ry:b.height*.32,fill:b.width/el('cad-extrude').clientWidth,ratio:b.width/b.height};})()");
    assert.ok(cadBox.fill>.95);
    assert.ok(Math.abs(cadBox.ratio-1.6)<.03);
    for(let i=0;i<=64;i++)await mouse(i?'mouseMoved':'mousePressed',cadBox.x+cadBox.rx*Math.cos(i*Math.PI/32),cadBox.y+cadBox.ry*Math.sin(i*Math.PI/32));
    await pause(650);await mouse('mouseReleased',cadBox.x+cadBox.rx,cadBox.y);
    assert.equal(await evaluate("el('cad-loop').value+':'+el('cad-shape').value"),'0:circle');
    await evaluate("el('cad-undo').click();el('cad-undo').click();el('work-tab').click()");
    const status=await evaluate(`(async()=>{
      const e=id=>document.getElementById(id), click=id=>e(id).click();
      click('cad-open');e('cad-shape').value='rectangle';e('cad-w').value=40;e('cad-h').value=30;click('cad-draw');click('cad-apply');
      click('work-tab');click('cad-tab');
      if(e('cad-history').options.length!==1)throw Error(e('cad-status').textContent);
      e('cad-name').value='测试底板';click('cad-store');
      e('cad-plane').value=Array.from(e('cad-plane').options).find(o=>o.value.startsWith('0,0,10000/')).value;
      e('cad-shape').value='circle';e('cad-w').value=20;click('cad-draw');e('cad-distance').value=-10;e('cad-op').value='subtract';click('cad-apply');
      if(e('cad-history').options.length!==2)throw Error(e('cad-status').textContent);
      click('cad-axes');if(e('cad-axes').getAttribute('aria-pressed')!=='true')throw Error('坐标轴开关');click('cad-axes');
      e('cad-history').selectedIndex=1;e('cad-history').onchange();click('cad-remove');
      if(e('cad-history').options.length!==1)throw Error('删除特征');
      e('cad').dispatchEvent(new KeyboardEvent('keydown',{ctrlKey:true,key:'z',bubbles:true}));
      if(e('cad-history').options.length!==2)throw Error('撤回删除');
      click('cad-store');await e('cad-save').onclick();return e('cad-status').textContent;
    })()`);
    assert.match(status,/已保存/);
    await evaluate(`(()=>{
      const e=id=>document.getElementById('cad-'+id);
      e('new').click();e('shape').value='rectangle';e('w').value=8;e('h').value=8;e('draw').click();e('apply').click();
      e('name').value='凸台';e('store').click();
      const cards=[...e('cards').children],base=cards.find(c=>c.textContent==='测试底板');
      base.click();e('load').click();
      const tool=[...e('cards').children].find(c=>c.textContent==='凸台'),transfer=new DataTransfer();
      tool.dispatchEvent(new DragEvent('dragstart',{dataTransfer:transfer}));
      e('view').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer}));
      if(e('kind').value!=='join')throw Error('拖入后未进入粘连');
      for(const [key,prefix] of [['target','0,0,10000/'],['toolface','0,0,-10000/']]){
        e(key).value=[...e(key).options].find(o=>o.value.startsWith(prefix)).value;
      }
      e('dx').value=15;e('preview').click();e('apply').click();
      if(!e('name').value.endsWith('合并'))throw Error(e('status').textContent);
      e('store').click();if(e('cards').children.length!==3)throw Error('源草稿数量不符');
    })()`);
    for(const [width,height] of [[1366,768],[1024,600],[390,844]]){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      const overflow=await evaluate("(()=>{const d=document.getElementById('cad');d.dataset.pane='edit';return d.scrollHeight-d.clientHeight;})()");
      assert.ok(overflow<=2,width+' × '+height+' 工作台纵向溢出 '+overflow);
    }
    await call('Page.reload',{});
    await pause(500);
    assert.equal(await evaluate("warehouseReady.then(()=>[...modelCatalog.values()].some(p=>p.name==='测试底板' && p.recipe.steps.length===2))"),true);
    await evaluate(`(async()=>{
      el('warehouse-tab').click();el('category-name').value='测试夹具';await el('add-class').onclick();
      const p=[...modelCatalog.values()].find(p=>p.name==='测试底板');await openStoredModel(p.id);
      if(el('model-name').textContent!==p.name)throw Error('模型标题应只显示自建零件名称');
      el('part-name').value='左侧压板';el('model-category').value='测试夹具';await el('save-category').onclick();
    })()`);
    await call('Page.reload',{});await pause(500);
    assert.equal(await evaluate("warehouseReady.then(()=>[...modelCatalog.values()].some(p=>p.name==='左侧压板' && p.category==='测试夹具'))"),true);
    console.log('Edge 离线页面通过停笔整形、尺寸编辑、撤销、顶面切孔、草稿保存、入库、改名分类及刷新验证');
  }finally{
    ws?.close();child.kill();
    await fs.rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200}).catch(()=>{});
  }
}
test().catch(e=>{console.error(e);process.exitCode=1;});
