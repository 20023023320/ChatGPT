'use strict';

const SketchEraser = (() => {
  const origins=new WeakMap();
  const origin=line=>origins.get(line) || line;

  // In coordinates aligned with the eraser sweep, its footprint is a
  // rectangle and two disks. Their union intersects a segment in one interval.
  function clippedInterval(x,y,dx,dy,length,r) {
    let low=Infinity, high=-Infinity;
    function include(a,b) {
      a=Math.max(0,a); b=Math.min(1,b);
      if(a<=b) {low=Math.min(low,a);high=Math.max(high,b);}
    }
    function disk(cx) {
      const rx=x-cx, norm=dx*dx+dy*dy;
      if(!norm) {if(rx*rx+y*y<=r*r) include(0,1);return;}
      const center=-(rx*dx+y*dy)/norm;
      const perpendicular=rx*dy-y*dx;
      const delta=r*r*norm-perpendicular*perpendicular;
      if(delta<0) return;
      const reach=Math.sqrt(delta)/norm;
      include(center-reach,center+reach);
    }
    disk(0);
    if(length) {
      disk(length);
      let a=0,b=1;
      for(const [start,step,min,max] of [[x,dx,0,length],[y,dy,-r,r]]) {
        if(!step) {if(start<min || start>max) {a=1;b=0;break;}}
        else {
          const u=(min-start)/step,v=(max-start)/step;
          a=Math.max(a,Math.min(u,v));b=Math.min(b,Math.max(u,v));
        }
      }
      include(a,b);
    }
    return low<=high?[low,high]:null;
  }
  function erase(lines,from,to,radius,sx,sy,whole) {
    const tx=(to[0]-from[0])*sx,ty=(to[1]-from[1])*sy;
    const length=Math.hypot(tx,ty), ux=length?tx/length:1,uy=length?ty/length:0;
    const output=[],removed=new Set();
    let changed=false;
    for(const line of lines) {
      const pieces=[];
      let piece=[],hit=false;
      function finish() {if(piece.length>=2) pieces.push(piece);piece=[];}
      for(let i=1;i<line.length;i++) {
        const a=line[i-1],b=line[i];
        const x=(a[0]-from[0])*sx,y=(a[1]-from[1])*sy;
        const dx=(b[0]-a[0])*sx,dy=(b[1]-a[1])*sy;
        const cut=clippedInterval(x*ux+y*uy,y*ux-x*uy,dx*ux+dy*uy,dy*ux-dx*uy,length,radius);
        if(!cut || (!whole && cut[1]-cut[0]<1e-9)) {
          if(!piece.length) piece.push(a);
          piece.push(b);
          continue;
        }
        hit=true;
        if(whole) {removed.add(origin(line));break;}
        const at=t=>[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
        if(cut[0]>0) {if(!piece.length) piece.push(a);piece.push(at(cut[0]));}
        finish();
        if(cut[1]<1) piece.push(at(cut[1]),b);
      }
      if(!hit) output.push(line);
      else {
        changed=true;
        finish();
        for(const fragment of pieces) {origins.set(fragment,origin(line));output.push(fragment);}
      }
    }
    if(!changed) return lines;
    return whole?output.filter(line=>!removed.has(origin(line))):output;
  }
  function serialize(lines){
    const groups=new Map();
    return lines.map(line=>{
      const source=origin(line);
      if(!groups.has(source))groups.set(source,groups.size);
      return {points:line.map(([x,y])=>[x,y]),group:groups.get(source),shape:line.shape&&structuredClone(line.shape)};
    });
  }
  function deserialize(saved){
    const groups=new Map();
    return saved.map(entry=>{
      const line=entry.points.map(([x,y])=>[x,y]);
      if(entry.shape)line.shape=structuredClone(entry.shape);
      if(!groups.has(entry.group))groups.set(entry.group,line);
      origins.set(line,groups.get(entry.group));return line;
    });
  }
  return {erase,origin,serialize,deserialize};
})();
if(typeof module!=='undefined') module.exports=SketchEraser;
