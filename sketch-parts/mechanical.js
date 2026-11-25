'use strict';

// Profiles run counterclockwise when viewed from above. Join consecutive
// profiles in boundary order (outer wall, top, bore, bottom); dimensions in mm.
const MechanicalModels = (() => {
  const circle=(radius,z,n=48)=>Array.from({length:n},(_,i)=>{
    const a=2*Math.PI*i/n;
    return [radius*Math.cos(a),radius*Math.sin(a),z];
  });
  function rectRing(w,h,z) {
    return circle(1,z).map(([x,y])=>[w*x/(2*Math.max(Math.abs(x),Math.abs(y))),h*y/(2*Math.max(Math.abs(x),Math.abs(y))),z]);
  }
  function loft(rings, capped=false) {
    const mesh=[];
    const tri=(a,b,c)=>mesh.push(...a,...b,...c);
    const n=rings[0].length;
    for(let k=0;k<(capped?rings.length-1:rings.length);k++) {
      const a=rings[k], b=rings[(k+1)%rings.length];
      for(let i=0;i<n;i++) {
        const j=(i+1)%n;
        tri(a[i],a[j],b[j]);tri(a[i],b[j],b[i]);
      }
    }
    if(capped) {
      for(const end of [0,rings.length-1]) {
        const ring=rings[end];
        const center=ring.reduce((s,p)=>s.map((v,d)=>v+p[d]/n),[0,0,0]);
        for(let i=0;i<n;i++) {
          const a=ring[i],b=ring[(i+1)%n];
          if(end===0) tri(center,b,a); else tri(center,a,b);
        }
      }
    }
    return mesh;
  }
  function channel() {
    // End faces are tiled to share the exact shoulder vertices with the side walls.
    const section=[[-21,0],[-16,0],[16,0],[21,0],[21,26],[16,26],[16,5],[-16,5],[-16,26],[-21,26],[-21,5],[21,5]];
    const edge=[0,1,2,3,11,4,5,6,7,8,9,10];
    const out=[];
    const point=(i,x)=>[x,...section[i]];
    function quad(a,b,c,d){out.push(...a,...b,...c,...a,...c,...d);}
    for(let i=0;i<edge.length;i++){
      const a=edge[i], b=edge[(i+1)%edge.length];
      quad(point(a,-55),point(b,-55),point(b,55),point(a,55));
    }
    for(const q of [[0,1,7,10],[1,2,6,7],[2,3,11,6],[10,7,8,9],[6,11,4,5]]) {
      quad(...q.map(i=>point(i,55)));quad(...q.slice().reverse().map(i=>point(i,-55)));
    }
    return out;
  }
  // Map the section plane to XZ and extrusion to -Y (proper rotation).
  function faceForward(mesh) {
    for(let i=0;i<mesh.length;i+=3) [mesh[i+1],mesh[i+2]]=[-mesh[i+2],mesh[i+1]];
    return mesh;
  }
  const model=(id,category,name,detail,mesh)=>({id,category,name,detail,mesh});
  return [
    model('BASE-01','基础类','圆柱体','直径 36 mm，高 48 mm。',()=>loft([circle(18,0),circle(18,48)],true)),
    model('PLT-01','板类','单孔安装板','板面 100 × 56 mm，厚 6 mm，中心通孔直径 18 mm。',
      ()=>faceForward(loft([rectRing(100,56,0),rectRing(100,56,6),circle(9,6),circle(9,0)]))),
    model('AX-01','轴套类','三级台阶轴','三个轴段的直径依次为 18、30、22 mm，轴长 88 mm。',()=>{
      const mesh=loft([[9,0],[9,22],[15,22],[15,56],[11,56],[11,88]].map(([r,z])=>circle(r,z)),true);
      for(let i=0;i<mesh.length;i+=3) [mesh[i],mesh[i+2]]=[mesh[i+2],-mesh[i]];
      return mesh;
    }),
    model('AX-02','轴套类','直筒衬套','外径 34 mm，内径 20 mm，长 52 mm。',
      ()=>faceForward(loft([circle(17,0),circle(17,52),circle(10,52),circle(10,0)]))),
    model('RNG-01','盘环类','平垫圈','外径 64 mm，内径 30 mm，厚 6 mm。',
      ()=>faceForward(loft([circle(32,0),circle(32,6),circle(15,6),circle(15,0)]))),
    model('SEC-01','型材类','槽钢段','长 110 mm，槽宽 32 mm，腹板与翼缘厚 5 mm。',channel),
    model('BRK-01','支架类','三角支撑架','直角边 68 × 48 mm，内有减重窗口，厚 16 mm。',()=>{
      const outer=z=>[[0,0,z],[68,0,z],[0,48,z]], inner=z=>[[8,8,z],[44,8,z],[8,33,z]];
      return faceForward(loft([outer(0),outer(16),inner(16),inner(0)]));
    }),
    model('BLK-01','规则块体','沉孔底座','底座 68 × 54 × 32 mm，通孔直径 14 mm，沉孔直径 26 mm、深 8 mm。',
      ()=>loft([rectRing(68,54,0),rectRing(68,54,32),circle(13,32),circle(13,24),circle(7,24),circle(7,0)])),
    model('SRF-01','复杂曲面类','扭转叶片','高 72 mm，截面逐渐收窄，叶根至叶尖扭转 55°。',()=>{
      const rings=Array.from({length:13},(_,i)=>{
        const t=i/12, angle=t*55*Math.PI/180;
        return circle(1,72*t,32).map(([u,v,z])=>{
          const a=u*(22-9*t), b=v*(4-2*t);
          return [a*Math.cos(angle)-b*Math.sin(angle)+9*t*t,a*Math.sin(angle)+b*Math.cos(angle),z];
        });
      });
      return loft(rings,true);
    })
  ];
})();

if(typeof module!=='undefined' && require.main===module) require('./write-stl.cjs')(MechanicalModels);
