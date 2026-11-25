'use strict';

const Parametric = (() => {
  const types = {flat:'平背法兰', boss:'凸台法兰', two:'双圆孔板', four:'四圆孔板', slot:'长槽板'};
  const definitions = {
    D:['外径',100], T:['厚度',8], B:['中心孔直径',24], PCD:['分布圆直径',68],
    N:['安装孔数',4], Hole:['安装孔直径',10], BD:['凸台直径',44], BH:['凸台高度',8],
    L:['板长',120], W:['板宽',72], X:['横向孔距',72], Y:['纵向孔距',36],
    SL:['槽总长',64], SW:['槽宽',16]
  };
  const layouts = {
    flat:['D','T','B','PCD','N','Hole'], boss:['D','T','B','PCD','N','Hole','BD','BH'],
    two:['L','W','T','Hole','X'], four:['L','W','T','Hole','X','Y'], slot:['L','W','T','SL','SW']
  };
  function fields(type) {
    return layouts[type].map(key=>({key,label:definitions[key][0],default:definitions[key][1]}));
  }
  function invalid(key,message) {
    const error=new Error(message);
    error.key=key;
    throw error;
  }
  function validate(type,p) {
    for(const key of layouts[type]) {
      if(!Number.isFinite(p[key]) || p[key]<=0) invalid(key,definitions[key][0]+'须为正数。');
      if(!Number.isFinite(Math.fround(p[key])) || Math.fround(p[key])===0) {
        invalid(key,definitions[key][0]+'超出 STL 坐标精度范围。');
      }
    }
    const span=p.D || Math.max(p.L,p.W);
    const minFeature=span*2e-6;
    for(const key of layouts[type]) {
      if(!['N','T','BH'].includes(key) && p[key]<minFeature) invalid(key,definitions[key][0]+'相对于零件尺寸过小。');
    }
    if(type==='flat' || type==='boss') {
      if(!Number.isInteger(p.N) || p.N<3 || p.N>16) invalid('N','安装孔数须为 3 至 16 的整数。');
      if(p.D-p.PCD-p.Hole<minFeature) invalid('PCD','安装孔须完整落在法兰外缘以内。');
      if(p.PCD-p.B-p.Hole<minFeature) invalid('B','中心孔与安装孔之间须保留材料。');
      if(p.PCD*Math.sin(Math.PI/p.N)-p.Hole<minFeature) invalid('Hole','相邻安装孔之间须保留材料。');
      if(type==='boss' && (p.BD-p.B<minFeature || p.PCD-p.BD-p.Hole<minFeature)) invalid('BD','凸台须包住中心孔，并与安装孔留出间距。');
      if(type==='boss' && (!Number.isFinite(Math.fround(p.T+p.BH)) || Math.fround(p.T+p.BH)===Math.fround(p.T))) invalid('BH','凸台高度超出 STL 坐标精度范围。');
    } else if(type==='slot') {
      if(p.SL-p.SW<minFeature) invalid('SL','槽总长须大于槽宽。');
      if(p.L-p.SL<minFeature) invalid('SL','槽总长须小于板长。');
      if(p.W-p.SW<minFeature) invalid('SW','槽宽须小于板宽。');
    } else {
      if(p.X-p.Hole<minFeature || p.L-p.X-p.Hole<minFeature) invalid('X','横向孔距须大于孔径，且两孔均须落在板内。');
      if(type==='two' && p.W-p.Hole<minFeature) invalid('Hole','安装孔直径须小于板宽。');
      if(type==='four' && (p.Y-p.Hole<minFeature || p.W-p.Y-p.Hole<minFeature)) invalid('Y','纵向孔距须大于孔径，且两孔均须落在板内。');
    }
  }
  function circle(x,y,r,n=64,angle=0) {
    return Array.from({length:n},(_,i)=>{
      const a=angle+2*Math.PI*i/n;
      return [x+r*Math.cos(a),y+r*Math.sin(a)];
    });
  }
  function capsule(length,width) {
    const radius=width/2, end=(length-width)/2, points=[];
    for(const side of [1,-1]) for(let i=0;i<=32;i++) {
      const a=(side===1 ? -Math.PI/2 : Math.PI/2)+Math.PI*i/32;
      points.push([side*end+radius*Math.cos(a),radius*Math.sin(a)]);
    }
    return points;
  }

  // Slice all profiles at shared heights. Splitting every face at the same
  // boundary vertices keeps holes and the step around a boss watertight.
  function triangulate(faces,walls,span,limit=Infinity) {
    const rings=walls.map(w=>w.ring);
    const snap=value=>Math.fround(Math.round(value/span*1e9)*1e-9*span);
    for(const ring of rings) for(const pt of ring) {
      pt[0]=snap(pt[0]);pt[1]=snap(pt[1]);
    }
    const levels=[...new Set(rings.flat().map(pt=>pt[1]))].sort((a,b)=>a-b);
    const edges=new Map(rings.map(r=>[r,r.map((pt,i)=>[pt,r[(i+1)%r.length]])]));
    function crossAt([a,b],y) {
      if(y===a[1]) return a[0];
      if(y===b[1]) return b[0];
      return snap(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));
    }
    const allEdges=[...edges.values()].flat();
    const rows=levels.map(y=>{
      const xs=new Set();
      for(const edge of allEdges) {
        const [a,b]=edge;
        if(y<Math.min(a[1],b[1]) || y>Math.max(a[1],b[1])) continue;
        xs.add(crossAt(edge,y));
        if(a[1]===b[1]) xs.add(b[0]);
      }
      return [...xs].sort((a,b)=>a-b);
    });
    const mesh=[];
    const vertex=(x,y,z)=>[x, -z, y]; // XZ front face, depth along -Y
    function emit(a,b,c,reverse=false) {
      if(mesh.length/9>=limit) throw new Error('模型超过 3 万个三角面，请简化轮廓。');
      mesh.push(...a,...(reverse?c:b),...(reverse?b:c));
    }
    function chain(row,left,right,z) {
      return rows[row].filter(x=>x>=left && x<=right).map(x=>vertex(x,levels[row],z));
    }
    for(let row=0;row<levels.length-1;row++) {
      const bottom=levels[row], top=levels[row+1], mid=(bottom+top)/2;
      const cuts=new Map();
      for(const ring of rings) {
        cuts.set(ring,edges.get(ring).filter(([a,b])=>(a[1]>mid)!==(b[1]>mid))
          .map(edge=>({bottom:crossAt(edge,bottom),top:crossAt(edge,top)})));
      }
      for(const {loops,z,reverse} of faces) {
        const crossings=loops.flatMap(r=>cuts.get(r)).sort((a,b)=>(a.bottom+a.top)-(b.bottom+b.top));
        for(let i=0;i<crossings.length;i+=2) {
          const left=crossings[i], right=crossings[i+1];
          const low=chain(row,left.bottom,right.bottom,z), high=chain(row+1,left.top,right.top,z);
          for(let j=1;j<low.length;j++) emit(high[0],low[j-1],low[j],reverse);
          for(let j=1;j<high.length;j++) emit(low[low.length-1],high[j],high[j-1],reverse);
        }
      }
    }
    for(const {ring,z0,z1,inside} of walls) {
      for(const edge of edges.get(ring)) {
        const [a,b]=edge;
        let points;
        if(a[1]===b[1]) {
          const row=levels.indexOf(a[1]);
          points=rows[row].filter(x=>x>=Math.min(a[0],b[0]) && x<=Math.max(a[0],b[0])).map(x=>[x,a[1]]);
          if(a[0]>b[0]) points.reverse();
        } else {
          points=levels.filter(y=>y>=Math.min(a[1],b[1]) && y<=Math.max(a[1],b[1])).map(y=>[crossAt(edge,y),y]);
          if(a[1]>b[1]) points.reverse();
        }
        for(let j=1;j<points.length;j++) {
          const p=points[j-1], q=points[j];
          const loP=vertex(...p,z0),loQ=vertex(...q,z0),hiP=vertex(...p,z1),hiQ=vertex(...q,z1);
          emit(loP,loQ,hiQ,inside);emit(loP,hiQ,hiP,inside);
        }
      }
    }
    return Float32Array.from(mesh);
  }
  function generate(type,p) {
    if(!Object.hasOwn(layouts,type)) throw new Error('请选择支持的零件类型。');
    validate(type,p);
    const flange=type==='flat' || type==='boss';
    // An outer vertex on each hole's radial axis preserves thin edge margins.
    const outerSteps=flange ? 4*p.N*Math.ceil(96/(4*p.N)) : 0;
    const outer=flange ? circle(0,0,p.D/2,outerSteps) :
      [[-p.L/2,-p.W/2],[p.L/2,-p.W/2],[p.L/2,p.W/2],[-p.L/2,p.W/2]];
    const holes=[];
    if(flange) {
      for(let i=0;i<p.N;i++) {
        const a=2*Math.PI*i/p.N;
        holes.push(circle(p.PCD/2*Math.cos(a),p.PCD/2*Math.sin(a),p.Hole/2,32,a));
      }
    } else if(type==='slot') holes.push(capsule(p.SL,p.SW));
    else for(const x of [-p.X/2,p.X/2]) for(const y of type==='four' ? [-p.Y/2,p.Y/2] : [0]) {
      holes.push(circle(x,y,p.Hole/2));
    }
    const bore=flange ? [circle(0,0,p.B/2,96)] : [];
    const boss=type==='boss' ? [circle(0,0,p.BD/2,96)] : [];
    const height=type==='boss' ? p.T+p.BH : p.T;
    const faces=[
      {loops:[outer,...holes,...bore],z:0,reverse:true},
      {loops:[outer,...holes,...(boss.length ? boss : bore)],z:p.T}
    ];
    if(boss.length) faces.push({loops:[...boss,...bore],z:height});
    const walls=[
      {ring:outer,z0:0,z1:p.T},
      ...holes.map(ring=>({ring,z0:0,z1:p.T,inside:true})),
      ...bore.map(ring=>({ring,z0:0,z1:height,inside:true})),
      ...boss.map(ring=>({ring,z0:p.T,z1:height}))
    ];
    return triangulate(faces,walls,flange ? p.D : Math.max(p.L,p.W));
  }
  function extrude(profile,box,width,thickness) {
    for(const [key,value] of [['width',width],['T',thickness]]) {
      if(!(value>0) || !Number.isFinite(Math.fround(value)) || !Math.fround(value))
        invalid(key,'请输入有效的正毫米尺寸。');
    }
    const loops=profile.map(ring=>ring.map(([x,y])=>[
      ((x-box.left)/box.width-.5)*width, ((box.top-y+box.height/2)/box.width)*width
    ]));
    const span=Math.max(width,box.height/box.width*width);
    if(!Number.isFinite(Math.fround(span))) invalid('width','轮廓尺寸超出 STL 坐标范围。');
    const faces=[{loops,z:0,reverse:true},{loops,z:thickness}];
    const walls=loops.map((ring,i)=>({ring,z0:0,z1:thickness,inside:i>0}));
    const mesh=triangulate(faces,walls,span,30000);
    // Validate the actual float32 vertices which will be written to the STL.
    const edges=new Map();
    for(let i=0;i<mesh.length;i+=9) {
      const [a,b,c]=[0,3,6].map(j=>mesh.subarray(i+j,i+j+3));
      const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
      if(!(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>0))
        throw new Error('轮廓细节小于 STL 精度，请简化相邻笔迹。');
      const ids=[a,b,c].map(p=>p.join(','));
      for(let j=0;j<3;j++) {
        const from=ids[j],to=ids[(j+1)%3],forward=from<to;
        const edge=forward?from+'|'+to:to+'|'+from;
        const mask=forward?1:2, seen=edges.get(edge)||0;
        if(seen & mask) throw new Error('轮廓生成了重叠面，请检查笔迹。');
        edges.set(edge,seen|mask);
      }
    }
    if(!edges.size || [...edges.values()].some(mask=>mask!==3)) throw new Error('网格未闭合，请检查轮廓。');
    return mesh;
  }
  function stl(vertices) {
    const count=vertices.length/9;
    const data=new DataView(new ArrayBuffer(84+50*count));
    new Uint8Array(data.buffer).set(new TextEncoder().encode('Sketch Parts | mm'));
    data.setUint32(80,count,true);
    for(let i=0;i<count;i++) {
      const k=9*i, at=84+50*i;
      const ax=vertices[k+3]-vertices[k],ay=vertices[k+4]-vertices[k+1],az=vertices[k+5]-vertices[k+2];
      const bx=vertices[k+6]-vertices[k],by=vertices[k+7]-vertices[k+1],bz=vertices[k+8]-vertices[k+2];
      const normal=[ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx];
      const len=Math.hypot(...normal);
      normal.forEach((v,j)=>data.setFloat32(at+4*j,v/len,true));
      for(let j=0;j<9;j++) data.setFloat32(at+12+4*j,vertices[k+j],true);
    }
    return data.buffer;
  }
  return {types,fields,generate,extrude,stl};
})();

if(typeof module!=='undefined') module.exports=Parametric;
