'use strict';
const assert=require('node:assert/strict');
const shapes=require('./shapes');
const rotate=([x,y])=>[220+x*Math.cos(.61)-y*Math.sin(.61),130+x*Math.sin(.61)+y*Math.cos(.61)];
for(const [kind,vertices] of [
  ['line',[[0,0],[100,0]]],
  ['triangle',[[0,0],[92,0],[35,64],[0,0]]],
  ['rectangle',[[0,0],[80,0],[80,41],[0,41],[0,0]]],
  ['square',[[0,0],[50,0],[50,50],[0,50],[0,0]]],
  ...['circle','ellipse'].map(kind=>[kind,Array.from({length:65},(_,i)=>[52*Math.cos(i*Math.PI/32),(kind==='ellipse'?24:52)*Math.sin(i*Math.PI/32)])])
]) {
  const shape=shapes.recognize(vertices.map(rotate));
  assert.equal(shape?.kind,kind);
  const resized={...shape,width:40/shapes.mmPerUnit};
  const line=shapes.render(resized);
  assert.equal(shapes.describe(line).width*shapes.mmPerUnit,40);
  if(kind!=='line') assert.deepEqual(line[0],line.at(-1));
}
assert.equal(shapes.recognize([[0,0],[50,100],[80,10]]),undefined);
console.log('Six rotated shape fits, dimensional edits and open scribble rejection passed.');
