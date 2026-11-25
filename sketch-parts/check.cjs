const assert = require('node:assert/strict');
const { parts, rank, rankWithLeft, suggestLeft } = require('./matcher.js');
const cases = require('./cases.js');
const flange = require('./flange-cases.js');

assert.deepEqual(rank([]), []);
assert.deepEqual(rank([[[4, 9], [4, 9]]]), []);
for (const part of parts) {
  const sameFront = rank(part.strokes);
  assert(sameFront.some(item => item.id === part.id && item.distance === sameFront[0].distance));
  const moved = part.strokes.map(stroke => stroke.map(([x, y]) => [37 + x * 2.3, y * 2.3 - 16]));
  const movedRanking = rank(moved);
  assert(movedRanking.some(item => item.id === part.id && item.distance === movedRanking[0].distance));
}
assert.equal(cases.length, 6);
for (const sample of cases) {
  const ranking = rank(sample.strokes);
  assert.equal(new Set(ranking.map(item => item.id)).size, parts.length);
  if (sample.kind === '完整') assert.equal(ranking[0].id, sample.target);
  console.log(sample.name, sample.target, ranking.map(item => item.id).join(' > '), ranking[0].id === sample.target ? '命中' : '偏差');
}
const front = rank(flange.front);
assert.deepEqual(front.slice(0, 2).map(item => item.id).sort(), ['FL-01','FL-02']);
assert.equal(front[0].distance, front[1].distance);
assert.equal(suggestLeft(front), true);
assert.equal(suggestLeft(rank(cases[0].strokes)), false);
assert.deepEqual(rankWithLeft(front, []), []);
for (const [field, expected] of [['flat','FL-01'],['boss','FL-02']]) {
  const result = rankWithLeft(front, flange[field]);
  assert.equal(result[0].id, expected);
  assert(result[1].distance > result[0].distance);
  assert.equal(result.length, parts.length);
  console.log('正视并列 → 补左视图', field, '→', result[0].id);
}
assert.equal(front[0].distance, front[1].distance, '补画后仍应保留原始正视排序');

const parametric = require('./parametric.js');
const defaults = type => Object.fromEntries(parametric.fields(type).map(f => [f.key,f.default]));
for (const type of Object.keys(parametric.types)) {
  const p = defaults(type);
  if ('D' in p) Object.assign(p,{D:120,N:6});
  const vertices = parametric.generate(type,p);
  const data = new DataView(parametric.stl(vertices));
  assert.equal(data.getUint32(80,true),vertices.length/9);
  let minX=Infinity,maxX=-Infinity;
  const edges=new Map();
  for (let t=0;t<vertices.length/9;t++) {
    const offset=84+50*t;
    const normal=[0,1,2].map(i=>data.getFloat32(offset+4*i,true));
    assert(Math.abs(Math.hypot(...normal)-1)<1e-5,'STL 面法线应有效');
    const face=[];
    for(let i=0;i<3;i++) {
      const point=[0,1,2].map(axis=>data.getFloat32(offset+12+i*12+axis*4,true));
      minX=Math.min(minX,point[0]); maxX=Math.max(maxX,point[0]);
      face.push(point.join(','));
    }
    for(let i=0;i<3;i++) {
      const a=face[i], b=face[(i+1)%3], key=[a,b].sort().join('|');
      const uses=edges.get(key) || []; uses.push(a<b?1:-1); edges.set(key,uses);
    }
  }
  assert.equal(maxX-minX,p.D || p.L,'下载应保留毫米尺度');
  assert([...edges.values()].every(uses=>uses.length===2 && uses[0]===-uses[1]),'每条边应闭合');
}
assert.throws(()=>parametric.generate('boss',{...defaults('boss'),BD:66}),{key:'BD'});
assert.throws(()=>parametric.generate('four',{...defaults('four'),Y:2}),{key:'Y'});
console.log('五种参数模板通过 STL 尺寸、法线、闭合性及参数校验');

const profile = require('./profile.js');
const outline = [[0,0],[120,0],[120,35],[90,35],[90,80],[0,80],[0,0]];
const boxHole = (x,y) => [[x,y],[x+10,y],[x+10,y+8],[x,y+8],[x,y]];
// Deliberately unordered and reversed strokes, including a one-pixel closing gap.
const segments = [
  [[120,0],[0,0]], [[0,80],[90,80],[90,35]],
  [[120,0],[120,35],[90,35]], [[0,80],[0,1]]
];
function generatedVolume(mesh) {
  let volume=0;
  for(let i=0;i<mesh.length;i+=9) {
    const [x,y,z,bx,by,bz,cx,cy,cz]=mesh.subarray(i,i+9);
    volume+=(x*(by*cz-bz*cy)+y*(bz*cx-bx*cz)+z*(bx*cy-by*cx))/6;
  }
  return volume;
}
for(const [strokes,holeCount] of [
  [[outline],0], [[outline,boxHole(20,20)],1],
  [[boxHole(54,38),...segments,boxHole(30,12),boxHole(5,30)],3]
]) {
  const original=JSON.stringify(strokes);
  const rings=profile.prepare(strokes);
  assert.equal(JSON.stringify(strokes),original);
  assert.equal(rings.length,1+holeCount);
  const mesh=parametric.extrude(rings,profile.extent(rings[0]),120,6);
  const volume=(120*80-30*45-10*8*holeCount)*6;
  assert(Math.abs(generatedVolume(mesh)-volume)<.001);
}
const rect=[[0,0],[100,0],[100,100],[0,100],[0,0]];
for(const invalid of [
  [[[0,0],[60,0],[80,40]]],
  [[[0,0],[80,80],[0,80],[80,0],[0,0]]],
  [rect,boxHole(96,30)], [rect,boxHole(120,30)], [rect,boxHole(0,30)],
  [rect,boxHole(15,15),boxHole(15,15).map(([x,y])=>[x/2+9,y/2+9])]
]) assert.throws(()=>profile.prepare(invalid),e=>e.points?.length>0);
const onlyOuter=profile.prepare([rect]);
assert.throws(()=>parametric.extrude(onlyOuter,profile.extent(rect),0,6),{key:'width'});
assert.throws(()=>parametric.extrude(onlyOuter,profile.extent(rect),120,-3),{key:'T'});
console.log('自由轮廓通过多笔闭合、凹形和偏心通孔体积、交叉与断口校验');

// Identical projected triangles whose depth order reverses across the image.
// A single painter's ordering cannot draw both sample points correctly.
const {paintMesh}=require('./viewer.js');
const flatFace=[-1,0,-1, 1,0,-1, 0,0,1];
const slantedFace=[-1,.6,-1, 1,-.6,-1, 0,0,1];
const palette=Uint32Array.from({length:101},(_,i)=>i+1);
function preview(mesh) {
  const pixels=new Uint32Array(100*100);
  paintMesh(mesh,100,100,0,0,1,palette,pixels,new Float64Array(pixels.length));
  return pixels;
}
const flatColor=preview(flatFace)[60*100+40],slantedColor=preview(slantedFace)[60*100+60];
assert(flatColor && slantedColor && flatColor!==slantedColor);
for(const triangles of [[...flatFace,...slantedFace],[...slantedFace,...flatFace]]) {
  const frame=preview(triangles);
  assert.equal(frame[60*100+40],flatColor);
  assert.equal(frame[60*100+60],slantedColor);
}
console.log('预览逐像素遮挡通过两种三角面顺序验证');

const eraser=require('./eraser.js');
const longStroke=[[0,0],[100,0]];
const untouched=[[20,10],[80,10]];
const drawing=[longStroke,untouched];
const cut=eraser.erase(drawing,[50,-2],[50,2],5,.5,2,false);
assert.deepEqual(cut,[[[0,0],[40,0]],[[60,0],[100,0]],untouched]);
assert.strictEqual(cut[2],untouched);
assert.strictEqual(eraser.origin(cut[1]),longStroke);
assert.deepEqual(eraser.erase(cut,[20,-100],[20,100],2,1,1,true),[]);
assert.deepEqual(eraser.erase(cut,[20,0],[20,0],2,1,1,true),[untouched]);
assert.strictEqual(eraser.erase(drawing,[50,80],[80,80],4,1,1,false),drawing);
assert.deepEqual(drawing[0],[[0,0],[100,0]]);
console.log('橡皮通过长线裁剪、连续扫过、缩放命中和整笔归属验证');
require('./profile-repair-check.cjs');
require('./shape-check.cjs');
require('./cad-check.cjs');
