const assert=require('node:assert/strict');
const {repair,prepare,extent}=require('./profile.js');
const {extrude}=require('./parametric.js');

const rect=[[0,0],[100,0],[100,100],[0,100],[0,0]];
const overshot=[
  [[-3,0],[104,0]],[[100,-2],[100,103]],[[103,100],[-3,100]],[[0,103],[0,-5]]
];
const oneStroke=[[[-3,0],[100,0],[100,100],[0,100],[0,-4]]];
function area(ring) {
  return Math.abs(ring.reduce((sum,[x,y],i)=>{
    const [u,v]=ring[(i+1)%ring.length];
    return sum+x*v-u*y;
  },0))/2;
}
function checkTails(strokes,count,expectedArea) {
  const original=structuredClone(strokes);
  const {rings,bridges,tails}=repair(strokes);
  assert.deepEqual(strokes,original);
  assert.deepEqual(prepare(strokes),rings);
  assert.equal(bridges.length,0);
  assert.equal(tails.length,count);
  assert(tails.every(line=>line.length>=2));
  const filled=area(rings[0])-rings.slice(1).reduce((s,r)=>s+area(r),0);
  assert(Math.abs(filled-expectedArea)<1e-7);
  assert(extrude(rings,extent(rings[0]),100,6).length>0);
}
checkTails([rect],0,10000);
checkTails(oneStroke,2,10000);
checkTails(overshot,8,10000);
checkTails(overshot.map(line=>line.map(([x,y])=>[8*x,8*y])),8,640000);
checkTails([[[-30,0],[100,0],[100,100],[0,100],[0,-40]]],2,10000);
const rotated=overshot.map(line=>line.map(([x,y])=>[(4*x-3*y)/5,(3*x+4*y)/5]).reverse()).reverse();
checkTails(rotated,8,10000);
const hole=overshot.map(line=>line.map(([x,y])=>[25+.3*x,20+.3*y]));
checkTails([rect,...hole],8,9100);

const circle=Array.from({length:37},(_,i)=>{
  const angle=.08+(2*Math.PI-.16)*i/36;
  return [50*Math.cos(angle),50*Math.sin(angle)];
});
const arc=repair([circle]);
assert.equal(arc.bridges.length,1);
assert.equal(arc.tails.length,0);
const bridge=arc.bridges[0];
assert(bridge.length>2);
assert(bridge[2][0]>Math.max(bridge[0][0],bridge.at(-1)[0]));
assert(extrude(arc.rings,extent(arc.rings[0]),100,6).length>0);

for(const [strokes,reason] of [
  [[[[0,0],[100,100],[0,100],[100,0],[0,0]]],/交叉/],
  [[[[0,0],[100,0],[100,100],[0,100],[0,24]]],/断口/],
  [[rect,[[20,20],[20,30],[27,30],[27,20]]],/断口/],
  [[[[0,0],[100,0],[100,100],[0,100],[0,8]],[[-1,2],[1,2],[1,5],[-1,5],[-1,2]]],/交叉/],
  [[[[-4,0],[-40,10],[-40,50],[0,50],[0,1]],[[1,0],[30,-2],[30,-40],[0,-40],[0,-1]]],/多个端点/],
  [[[[0,0],[100,0],[70,0],[70,50],[0,50],[0,0]]],/重叠/],
  [[rect,[[30,30],[70,35]]],/断口/]
]) assert.throws(()=>repair(strokes),e=>reason.test(e.message) && e.points?.length>0);
console.log('轮廓修补通过单笔、多笔、斜边、内孔、平滑补线和歧义拒绝验证。');
