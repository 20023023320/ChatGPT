'use strict';

// All lengths are in mm. Only the boundary between timber and empty space
// becomes a mesh face, including the four inside walls of the open mortise.
const TimberModels = (() => {
  function solid(xs, ys, zs, filled, position = (x,y,z) => [x,y,z]) {
    const mesh = [];
    const inside = (i,j,k) => i>=0 && i<xs.length-1 && j>=0 && j<ys.length-1 &&
      k>=0 && k<zs.length-1 && filled(i,j,k);
    const sides = [
      [-1,0,0,[0,4,7,3]], [1,0,0,[1,2,6,5]], [0,-1,0,[0,1,5,4]],
      [0,1,0,[3,7,6,2]], [0,0,-1,[0,3,2,1]], [0,0,1,[4,5,6,7]]
    ];
    for(let i=0;i<xs.length-1;i++) for(let j=0;j<ys.length-1;j++) for(let k=0;k<zs.length-1;k++) {
      if(!inside(i,j,k)) continue;
      const corners = [[i,j,k],[i+1,j,k],[i+1,j+1,k],[i,j+1,k],
        [i,j,k+1],[i+1,j,k+1],[i+1,j+1,k+1],[i,j+1,k+1]]
        .map(([a,b,c])=>position(xs[a],ys[b],zs[c]));
      for(const [di,dj,dk,[a,b,c,d]] of sides) {
        if(inside(i+di,j+dj,k+dk)) continue;
        for(const n of [a,b,c,a,c,d]) mesh.push(...corners[n]);
      }
    }
    return new Float32Array(mesh);
  }
  const models = [
    {
      id:'TM-01', name:'直榫枋头', category:'榫卯类', family:'榫卯',
      detail:'保留四面榫肩，榫头截面 40 × 60 mm，出榫 82 mm，与 TM-02 配对。',
      mesh:()=>solid([-42,-20,20,42],[-150,0,82],[-48,-30,30,48],
        (i,j,k)=>j===0 || (i===1 && k===1))
    },
    {
      id:'TM-02', name:'透卯柱段', category:'榫卯类', family:'榫卯',
      detail:'正面卯口 40 × 60 mm，前后贯通 80 mm。按名义尺寸与 TM-01 配合。',
      mesh:()=>solid([-55,-20,20,55],[-40,40],[-110,-30,30,110],
        (i,j,k)=>i!==1 || k!==1)
    },
    {
      id:'DG-01', name:'十字口坐斗', category:'斗栱类', family:'斗栱（斗拱）',
      detail:'下部收分，上部四角留斗耳。十字槽宽 44 mm、深 28 mm，可容纳 DG-02 的栱身。',
      mesh:()=>{
        const grid=[-72,-22,22,72];
        return solid(grid,grid,[0,12,48,60,88],(i,j,k)=>k<3 || (i!==1 && j!==1),
          (x,y,z)=>{
            const scale=z<=12 ? 42/72 : 1;
            return [x*scale,y*scale,z];
          });
      }
    },
    {
      id:'DG-02', name:'卷杀栱身', category:'斗栱类', family:'斗栱（斗拱）',
      detail:'栱身长 324 mm、厚 44 mm。两端下缘分段卷杀，中部留交搭槽口。',
      mesh:()=>{
        const stations=[-162,-145,-125,-100,-72,-48,-30,-22,22,30,48,72,100,125,145,162];
        const bottom=[60,47,34,21,10,3,0,0,0,0,3,10,21,34,47,60];
        const profile=new Map(stations.map((x,i)=>[x,bottom[i]]));
        return solid(stations,[-22,22],[0,64,84],(i,j,k)=>k===0 || stations[i]!==-22,
          (x,y,z)=>[x,y,z===0 ? profile.get(x) : z]);
      }
    }
  ];
  return models;
})();

if(typeof module!=='undefined' && require.main===module) require('./write-stl.cjs')(TimberModels);
