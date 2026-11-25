'use strict';

const CadGeometry=(()=>{
  const node=typeof module!=='undefined' && module.exports;
  const kernel=node?require('./vendor/jscad-2.13.0/jscad-modeling.min.js'):jscadModeling;
  const parametric=node?require('./parametric'):Parametric;
  const profiles=node?require('./profile'):FreeProfile;
  const {geom2,geom3}=kernel.geometries;
  const {subtract,intersect,union,scission}=kernel.booleans;
  const minus=(a,b)=>a.map((x,i)=>x-b[i]);
  const add=(a,b)=>a.map((x,i)=>x+b[i]);
  const times=(a,n)=>a.map(x=>x*n);
  const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=a=>times(a,1/Math.hypot(...a));
  const rounded=value=>Math.round(value*1e5);
  function triangles(raw) {
    const result=[];
    for(let i=0;i<raw.length;i+=9) result.push([0,3,6].map(k=>Array.from(raw.slice(i+k,i+k+3))));
    return result;
  }
  function faces(raw) {
    const edges=new Map(),items=[];
    triangles(raw).forEach(([a,b,c],index)=>{
      const vector=cross(minus(b,a),minus(c,a)),area=Math.hypot(...vector)/2;
      if(!area) return;
      const vertices=[a,b,c].map(p=>p.map(rounded).join(','));
      const item={index,area,normal:unit(vector),centroid:times(add(add(a,b),c),1/3),neighbors:[]};
      for(let j=0;j<3;j++) {
        const edge=[vertices[j],vertices[(j+1)%3]].sort().join('|');
        const other=edges.get(edge);
        if(other) {other.neighbors.push(item);item.neighbors.push(other);}
        else edges.set(edge,item);
      }
      items.push(item);
    });
    const output=[];
      for(const item of items) {
        if(item.seen) continue;
        const queue=[item],indices=[];
        let area=0,weighted=[0,0,0],resultant=[0,0,0];
        item.seen=true;
        while(queue.length) {
          const next=queue.pop();
          indices.push(next.index);
          weighted=add(weighted,times(next.centroid,next.area));area+=next.area;
          resultant=add(resultant,times(next.normal,next.area));
          for(const neighbor of next.neighbors) if(!neighbor.seen && dot(item.normal,neighbor.normal)>1-1e-8) {
            neighbor.seen=true;queue.push(neighbor);
          }
        }
        const center=times(weighted,1/area),normal=unit(resultant);
        output.push({direction:normal.map(x=>Math.round(x*1e4)).join(','),level:rounded(dot(center,normal)),normal,triangles:indices,center});
      }
    output.sort((a,b)=>a.direction.localeCompare(b.direction)||a.level-b.level||a.center[0]-b.center[0]||a.center[1]-b.center[1]||a.center[2]-b.center[2]);
    const totals=new Map(),counts=new Map();
    for(const f of output) totals.set(f.direction,(totals.get(f.direction)||0)+1);
    for(const [index,f] of output.entries()) {
      const count=(counts.get(f.direction)||0)+1;counts.set(f.direction,count);
      f.id=f.direction+'/'+count+'of'+totals.get(f.direction);
      f.label='平面 '+(index+1)+' · ('+f.center.map(x=>Number(x.toFixed(2))).join(', ')+') mm';
    }
    return output;
  }
  function face(raw,id) {
    const result=raw && faces(raw).find(f=>f.id===id);
    if(!result) throw new Error('所选平面已消失，请重新选面。');
    return result;
  }
  function basis(n) {
    const ref=Math.abs(n[0])<.9?[1,0,0]:[0,1,0];
    const u=unit(minus(ref,times(n,dot(n,ref))));
    return [u,cross(n,u),n];
  }
  function lift(axes,p) {
    return axes.reduce((v,axis,i)=>add(v,times(axis,p[i])),[0,0,0]);
  }
  const solid=raw=>geom3.fromPoints(triangles(raw));
  function mesh(s) {
    const polygons=geom3.toPoints(kernel.modifiers.generalize({snap:true,triangulate:true},s));
    if(!polygons.length) throw new Error('结果为空，请检查两实体是否重合。');
    return Float32Array.from(polygons.flat(2));
  }
  function extrude(step,raw) {
    const axes={XY:[[1,0,0],[0,1,0],[0,0,1]],XZ:[[1,0,0],[0,0,1],[0,-1,0]],YZ:[[0,1,0],[0,0,1],[1,0,0]]};
    let frame=axes[step.plane],center=[0,0,0];
    if(!frame) {const f=face(raw,step.plane);frame=basis(f.normal);center=f.center;}
    if(!Number.isFinite(step.distance)||!step.distance) throw new Error('拉伸距离须为非零毫米数。');
    const loops=step.rings.map(points=>{
      const area=points.reduce((v,p,i)=>{const q=points[(i+1)%points.length];return v+p[0]*q[1]-q[0]*p[1];},0);
      return geom2.fromPoints(area<0?points.slice().reverse():points);
    });
    const region=loops.length>1?subtract(...loops):loops[0];
    const shape=kernel.extrusions.extrudeLinear({height:Math.abs(step.distance)},region);
    return geom3.fromPoints(geom3.toPoints(shape).map(poly=>poly.map(([x,y,z])=>add(center,lift(frame,[x,y,z+Math.min(0,step.distance)])))));
  }
  function join(step,raw) {
    const tool=build(step.tool),a=face(raw,step.targetFace),b=face(tool,step.toolFace);
    const target=basis(a.normal),source=basis(b.normal);
    const angle=(step.angle||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    const transformed=triangles(tool).map(poly=>poly.map(point=>{
      const d=minus(point,b.center),[x,y,z]=source.map(axis=>dot(axis,d));
      return add(a.center,lift(target,[c*x+s*y+(step.dx||0),s*x-c*y+(step.dy||0),-z]));
    }));
    // The selected faces must share area. A common edge alone can otherwise
    // appear connected to a mesh component test.
    const project=poly=>poly.map(p=>[dot(p,target[0]),dot(p,target[1])]);
    const sourceFaces=b.triangles.map(i=>project(transformed[i]));
    const fixed=triangles(raw);
    const touching=a.triangles.some(i=>{
      const polygon=project(fixed[i]);
      return sourceFaces.some(other=>overlapTriangles(polygon,other));
    });
    if(!touching) throw new Error('所选两面没有重叠面积，请调整面内位置。');
    const result=union(solid(raw),geom3.fromPoints(transformed));
    if(scission(result).length!==1) throw new Error('两面没有形成连续实体，请调整贴合位置。');
    return result;
  }
  function overlapTriangles(a,b) {
    for(const triangle of [a,b]) for(let i=0;i<3;i++) {
      const [x,y]=minus(triangle[i],triangle[(i+1)%3]);
      const axis=[-y,x],pa=a.map(p=>dot(p,axis)),pb=b.map(p=>dot(p,axis));
      if(Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))<=1e-7*Math.hypot(x,y)) return false;
    }
    return true;
  }
  function build(recipe) {
    let raw;
    for(const [i,step] of recipe.steps.entries()) {
      try {
        if(step.kind==='base') {
          if(step.type==='free') raw=parametric.extrude(step.profile,profiles.extent(step.profile.flat()),step.params.width,step.params.T);
          else if(step.type) raw=parametric.generate(step.type,step.params);
          else raw=Float32Array.from(step.raw);
        } else if(step.kind==='join') raw=mesh(join(step,raw));
        else if(step.kind==='extrude') {
          const tool=extrude(step,raw);
          const operations={union,subtract,intersect};
          if(step.op==='new') raw=mesh(tool);
          else if(raw && operations[step.op]) raw=mesh(operations[step.op](solid(raw),tool));
          else throw new Error('缺少目标实体或运算类型。');
        } else throw new Error('无法读取建模步骤。');
        if(!raw?.length) throw new Error('缺少实体。');
      } catch(cause) {
        const error=new Error('第 '+(i+1)+' 步：'+cause.message);
        error.stepIndex=i;throw error;
      }
    }
    return raw;
  }
  return {faces,build};
})();
if(typeof module!=='undefined') module.exports=CadGeometry;
