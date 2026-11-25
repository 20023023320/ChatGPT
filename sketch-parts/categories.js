'use strict';
const PartCategories=(()=>{
  const defaults=['基础类','板类','轴套类','盘环类','型材类','支架类','规则块体','复杂曲面类','榫卯类','斗栱类'];
  const pending='待分类', storage='sketch-parts-catalog-metadata';
  let data={labels:{},extra:[],parts:{}};
  try {data=JSON.parse(localStorage.getItem(storage)) || data;} catch {}
  const keys=()=>[...defaults,...data.extra];
  const label=k=>Object.hasOwn(data.labels,k)?data.labels[k]:k;
  const keyFor=name=>keys().find(k=>label(k)===name) ?? pending;
  function change(action) {
    const next=structuredClone(data);
    action(next);
    localStorage.setItem(storage,JSON.stringify(next));
    data=next;
  }
  function setCategory(name,old) {
    if(!name || name===pending || keys().some(k=>label(k)===name)) throw new Error('请输入未使用的类别名称');
    change(next=>{
      const k=old?keyFor(old):crypto.randomUUID();
      if(!old) next.extra.push(k);
      next.labels[k]=name;
    });
  }
  function savePart(id,name,category) {
    change(next=>Object.defineProperty(next.parts,id,{value:{name,key:keyFor(category)},enumerable:true,writable:true,configurable:true}));
  }
  function apply(part) {
    const info=Object.hasOwn(data.parts,part.id) && data.parts[part.id];
    if(info) part.name=info.name;
    part.category=label(info ? info.key : part.categoryKey ?? part.category);
  }
  function populate(select,all) {
    select.replaceChildren();
    if(all) select.add(new Option('全部类别',''));
    for(const name of [...keys().map(label),pending]) select.add(new Option(name,name));
    select.value=all?'':pending;
  }
  return {get names(){return keys().map(label);},pending,keyFor,populate,apply,savePart,setCategory};
})();
