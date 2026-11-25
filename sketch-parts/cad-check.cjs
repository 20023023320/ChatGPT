'use strict';
const assert=require('node:assert/strict');
const {build,faces}=require('./cad-geometry');
const parametric=require('./parametric');

function volume(raw){
  let six=0;
  for(let i=0;i<raw.length;i+=9){
    const [a,b,c,d,e,f,g,h,j]=raw.subarray(i,i+9);
    six+=a*(e*j-f*h)+b*(f*g-d*j)+c*(d*h-e*g);
  }
  return six/6;
}
function assertSolid(raw,expected){
  assert.ok(Math.abs(volume(raw)-expected)<Math.max(.01,expected*.0001),String(volume(raw)));
  const edges=new Map();
  for(let i=0;i<raw.length;i+=9){
    const v=[0,3,6].map(k=>raw.subarray(i+k,i+k+3).join(','));
    for(let j=0;j<3;j++){
      const a=v[j],b=v[(j+1)%3],key=[a,b].sort().join('|');
      edges.set(key,(edges.get(key)||0)+(a<b?1:-1));
    }
  }
  assert.ok([...edges.values()].every(n=>n===0),'STL 含开放边');
  assert.equal(parametric.stl(raw).byteLength,84+50*raw.length/9);
}
const rectangle=(x,y)=>[[-x,-y],[x,-y],[x,y],[-x,y]];
const plate={kind:'extrude',op:'new',rings:[rectangle(20,15)],plane:'XY',distance:5};
const raw=build({steps:[plate]}),planes=faces(raw);
assertSolid(raw,6000);
assert.equal(planes.length,6);
const top=planes.find(f=>f.normal[2]>.99).id;
const bottom=planes.find(f=>f.normal[2]<-.99).id;
const tool={...plate,rings:[rectangle(5,5)],distance:3};
const join={kind:'join',targetFace:top,toolFace:bottom,tool:{steps:[tool]},dx:12,dy:3,angle:90};
assertSolid(build({steps:[plate,join]}),6300);
for(const dx of [25,30]) assert.throws(()=>build({steps:[plate,{...join,dx}]}),/没有重叠面积/);
const cut={...tool,op:'subtract',plane:top,distance:-20};
assertSolid(build({steps:[plate,cut]}),5500);
assertSolid(build({steps:[{...plate,distance:10},cut]}),11000);
assertSolid(build({steps:[plate,{...cut,op:'intersect'}]}),500);
const circle=Array.from({length:64},(_,i)=>[10*Math.cos(i*Math.PI/32),10*Math.sin(i*Math.PI/32)]);
const circleArea=3200*Math.sin(Math.PI/32);
assertSolid(build({steps:[plate,{...cut,rings:[circle]}]}),6000-circleArea*5);
assertSolid(build({steps:[plate,{...cut,op:'union',distance:4}]}),6400);
for(const plane of ['XZ','YZ'])assertSolid(build({steps:[{...plate,plane}]}),6000);
assert.throws(()=>build({steps:[plate,{...cut,plane:'missing'}]}),/第 2 步/);
assert.throws(()=>build({steps:[plate,{...cut,op:'intersect',distance:4}]}),/结果为空/);
console.log('CAD 通过三基准面、贴合面积、布尔体积、封闭 STL 和修改上游尺寸后的重算验证。');
