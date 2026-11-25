'use strict';

const SketchShapes = (() => {
  const mmPerUnit = 0.25;
  const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
  function deviation(p,a,b) {
    const x=b[0]-a[0], y=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y || 1)));
    return distance(p,[a[0]+t*x,a[1]+t*y]);
  }
  function simplify(path,tolerance) {
    let cut=0, max=tolerance;
    for(let i=1;i<path.length-1;i++) {
      const error=deviation(path[i],path[0],path.at(-1));
      if(error>max) {max=error;cut=i;}
    }
    return cut?simplify(path.slice(0,cut+1),tolerance).slice(0,-1).concat(simplify(path.slice(cut),tolerance)):[path[0],path.at(-1)];
  }
  function frame(vertices,angle) {
    const c=Math.cos(angle),s=Math.sin(angle);
    const local=vertices.map(([x,y])=>[x*c+y*s,y*c-x*s]);
    const xs=local.map(p=>p[0]),ys=local.map(p=>p[1]);
    const left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top;
    const x=left+width/2,y=top+height/2;
    return {width,height,angle,center:[x*c-y*s,x*s+y*c],local:local.map(([u,v])=>[(u-x)/(width||1),(v-y)/(height||1)])};
  }
  function recognize(path) {
    if(path.length<2) return;
    const a=path[0],b=path.at(-1),span=Math.max(...path.map(p=>distance(p,a)));
    if(span<12) return;
    const angle=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0]);
    if(distance(a,b)>span*.8 && path.every(p=>deviation(p,a,b)<span*.065))
      return {...frame([a,b],angle(a,b)),kind:'line',height:0,local:[[-.5,0],[.5,0]]};
    if(distance(a,b)>span*.22) return;
    // Start at a point far from the seam so a mid-edge seam is simplified away.
    const pivot=path.findIndex(p=>distance(a,p)===span);
    const loop=path.slice(pivot).concat(path.slice(0,pivot+1));
    const corners=simplify(loop,span*.045).slice(0,-1);
    if(corners.length>2 && deviation(corners[0],corners.at(-1),corners[1])<span*.045) corners.shift();
    if(corners.length===3 || corners.length===4) {
      const rect=corners.length===4;
      if(rect && !corners.every((p,i)=>{
        const q=corners[(i+1)%4],r=corners[(i+3)%4];
        return Math.abs((q[0]-p[0])*(r[0]-p[0])+(q[1]-p[1])*(r[1]-p[1]))<distance(p,q)*distance(p,r)*.35;
      })) return;
      const shape=frame(corners,angle(corners[0],corners[1]));
      shape.kind=rect?'rectangle':'triangle';
      if(Math.min(shape.width,shape.height)<4) return;
      if(rect) {
        shape.local=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];
        if(Math.abs(shape.width-shape.height)<.13*Math.max(shape.width,shape.height)) {
          shape.kind='square';shape.width=shape.height=(shape.width+shape.height)/2;
        }
      }
      return shape;
    }
    if(corners.length<5) return;
    // Search for the smallest enclosing rectangle to estimate the axes.
    let box;
    for(let i=0;i<90;i+=2) {
      const candidate=frame(path,i*Math.PI/180);
      if(!box || candidate.width*candidate.height<box.width*box.height) box=candidate;
    }
    if(Math.min(box.width,box.height)<5 || box.local.some(([x,y])=>Math.abs(2*Math.hypot(x,y)-1)>.19)) return;
    box.kind='ellipse';
    if(Math.abs(box.width-box.height)<.13*Math.max(box.width,box.height)) {
      box.kind='circle';box.width=box.height=(box.width+box.height)/2;
    }
    box.local=Array.from({length:96},(_,i)=>[Math.cos(i*Math.PI/48)/2,Math.sin(i*Math.PI/48)/2]);
    return box;
  }
  function render(shape) {
    const c=Math.cos(shape.angle),s=Math.sin(shape.angle);
    const line=shape.local.map(([u,v])=>{
      const x=u*shape.width,y=v*shape.height;
      return [shape.center[0]+x*c-y*s,shape.center[1]+x*s+y*c];
    });
    if(shape.kind!=='line') line.push([...line[0]]);
    line.shape=shape;
    return line;
  }
  function triangle(vertices,original) {
    const [a,b]=vertices;
    const shape=frame(vertices,Math.atan2(b[1]-a[1],b[0]-a[0]));
    if(shape.width<.01 || shape.height<.01) return;
    return render({...shape,kind:'triangle',original});
  }
  return {recognize,render,triangle,describe:line=>line?.shape,mmPerUnit};
})();
if(typeof module!=='undefined') module.exports=SketchShapes;
