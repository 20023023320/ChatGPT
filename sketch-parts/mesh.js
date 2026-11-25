'use strict';

const ModelMesh = (() => {
  const maxTriangles = 30000;
  function normalize(vertices) {
    const low = [Infinity,Infinity,Infinity], high = [-Infinity,-Infinity,-Infinity];
    for (let i=0; i<vertices.length; i++) {
      const dim = i%3, v = vertices[i];
      if (!Number.isFinite(v)) throw new Error('模型含有无效坐标');
      low[dim] = Math.min(low[dim],v); high[dim] = Math.max(high[dim],v);
    }
    const span = Math.max(...high.map((value,d) => value-low[d]));
    if (!(span>0) || !Number.isFinite(span)) throw new Error('模型没有有效尺寸');
    return Float32Array.from(vertices,(v,i) => 2*((v-low[i%3])/span)-(high[i%3]-low[i%3])/span);
  }
  function parse(buffer) {
    const data = new DataView(buffer);
    const count = buffer.byteLength >= 84 ? data.getUint32(80,true) : 0;
    if (count && 84+50*count === buffer.byteLength) {
      if (count>maxTriangles) throw new Error('请将模型简化至 3 万个三角面以内');
      const xyz = new Float32Array(count*9);
      for (let t=0;t<count;t++) for(let j=0;j<9;j++) xyz[t*9+j]=data.getFloat32(96+t*50+j*4,true);
      return normalize(xyz);
    }
    const text = new TextDecoder().decode(buffer);
    if (!/^\s*solid\b/i.test(text)) throw new Error('无法读取 STL 文件头或三角面数据');
    const xyz = [];
    for (const match of text.matchAll(/\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gi)) {
      xyz.push(Number(match[1]),Number(match[2]),Number(match[3]));
      if (xyz.length>maxTriangles*9) throw new Error('请将模型简化至 3 万个三角面以内');
    }
    if (!xyz.length || xyz.length%9) throw new Error('STL 三角面数据不完整');
    return normalize(xyz);
  }

  // Rasterize an orthographic depth buffer so hidden back-side details do not enter the index.
  function outline(vertices, axis) {
    const size=96, depth=new Float32Array(size*size).fill(-Infinity);
    const normals=new Float32Array(size*size*3);
    function project(i) {
      const x=vertices[i], y=vertices[i+1], z=vertices[i+2];
      if(axis.startsWith('iso')) {
        let a=x,b=y;
        if(axis==='isoFL') {a=-y;b=x;}
        if(axis==='isoBR') {a=y;b=-x;}
        if(axis==='isoBL') {a=-x;b=-y;}
        const u=(a+b)/Math.sqrt(2), v=(a-b-2*z)/Math.sqrt(6), w=(a-b+z)/Math.sqrt(3);
        return [48+26*u,48+26*v,w*26/44];
      }
      const [u,v,w]=axis==='front' ? [x,-z,-y] : axis==='left' ? [-y,-z,-x] : [x,-y,z];
      return [48+44*u,48+44*v,w];
    }
    for(let i=0;i<vertices.length;i+=9) {
      const [x,y,z]=project(i), [bx,by,bz]=project(i+3), [cx,cy,cz]=project(i+6);
      const dx=bx-x,dy=by-y,ex=cx-x,ey=cy-y,det=dx*ey-dy*ex;
      if(Math.abs(det)<1e-7) continue;
      const dzx=((bz-z)*ey-(cz-z)*dy)/det, dzy=(dx*(cz-z)-ex*(bz-z))/det;
      const length=Math.hypot(44*dzx,44*dzy,1);
      for(let row=Math.floor(Math.min(y,by,cy));row<=Math.ceil(Math.max(y,by,cy));row++) {
        for(let col=Math.floor(Math.min(x,bx,cx));col<=Math.ceil(Math.max(x,bx,cx));col++) {
          const rx=col+.5-x, ry=row+.5-y, u=(rx*ey-ry*ex)/det, v=(dx*ry-dy*rx)/det;
          if(u<0 || v<0 || u+v>1) continue;
          const k=row*size+col, h=z+rx*dzx+ry*dzy;
          if(h<=depth[k]) continue;
          depth[k]=h;
          normals[3*k]=-44*dzx/length; normals[3*k+1]=-44*dzy/length; normals[3*k+2]=1/length;
        }
      }
    }
    function edge(a,b) {
      if(depth[a]===-Infinity || depth[b]===-Infinity) return depth[a]!==depth[b];
      const dot=normals[3*a]*normals[3*b]+normals[3*a+1]*normals[3*b+1]+normals[3*a+2]*normals[3*b+2];
      return dot<.82 || Math.abs(depth[a]-depth[b])>.06+1/(44*Math.max(.02, Math.min(normals[3*a+2],normals[3*b+2])));
    }
    // Join grid edges into polylines, keeping storage and matching work proportional to the outline.
    const links=new Map();
    function connect(a,b) {
      if(!links.has(a)) links.set(a,new Set());
      if(!links.has(b)) links.set(b,new Set());
      links.get(a).add(b); links.get(b).add(a);
    }
    for(let y=1;y<size-1;y++) for(let x=1;x<size-1;x++) {
      const k=y*size+x;
      if(edge(k,k-1)) connect(k,k+size);
      if(edge(k,k-size)) connect(k,k+1);
    }
    const lines=[];
    for(const [start,adjacent] of links) while(adjacent.size) {
      const line=[]; let at=start;
      while(true) {
        line.push([at%size,Math.floor(at/size)]);
        const next=links.get(at).values().next().value;
        if(next===undefined) break;
        links.get(at).delete(next); links.get(next).delete(at); at=next;
      }
      lines.push(line);
    }
    return lines;
  }
  function example(shape='angle') {
    // Extrude a small set of parametric profiles along X.
    const yz=shape==='block' ? [[0,0],[1,0],[1,.38],[0,.38]] :
      shape==='wedge' ? [[0,0],[1,0],[0,.85]] : [[0,0],[1,0],[1,.18],[.2,.18],[.2,.85],[0,.85]];
    const faces=shape==='block' ? [[0,1,2],[0,2,3]] : shape==='wedge' ? [[0,1,2]] : [[0,1,2],[0,2,3],[0,3,5],[3,4,5]];
    const pts=[];
    const v=(side,i)=>[side*.9,...yz[i]];
    for(let i=0;i<yz.length;i++) {
      const j=(i+1)%yz.length;
      pts.push(v(-1,i),v(1,i),v(1,j),v(-1,i),v(1,j),v(-1,j));
    }
    for(const side of [-1,1]) for(const tri of faces)
      for(const i of tri) pts.push(v(side,i));
    return normalize(pts.flat());
  }
  return {parse,outline,example,normalize};
})();
