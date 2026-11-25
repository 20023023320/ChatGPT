const fs=require('node:fs');
const path=require('node:path');

// Write the same triangles used by the offline viewer in their original mm scale.
module.exports=function writeModels(models) {
  const dir=path.join(__dirname,'models');
  fs.mkdirSync(dir,{recursive:true});
  for(const model of models) {
    const v=model.mesh(), count=v.length/9;
    const data=Buffer.alloc(84+count*50);
    data.write(model.id+' | mm');
    data.writeUInt32LE(count,80);
    for(let i=0;i<count;i++) {
      const p=9*i, offset=84+50*i;
      const ax=v[p+3]-v[p], ay=v[p+4]-v[p+1], az=v[p+5]-v[p+2];
      const bx=v[p+6]-v[p], by=v[p+7]-v[p+1], bz=v[p+8]-v[p+2];
      const normal=[ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx];
      const length=Math.hypot(...normal);
      normal.forEach((n,j)=>data.writeFloatLE(n/length,offset+4*j));
      for(let j=0;j<9;j++) data.writeFloatLE(v[p+j],offset+12+4*j);
    }
    fs.writeFileSync(path.join(dir,model.id+'.stl'),data);
  }
};
