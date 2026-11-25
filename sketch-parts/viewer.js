'use strict';

// The lookup tables have the same native RGBA byte order as ImageData.
function viewerColors(wood) {
  const strip=document.createElement('canvas');
  strip.width=101;strip.height=1;
  const ctx=strip.getContext('2d');
  for(let shade=0;shade<=100;shade++) {
    ctx.fillStyle=wood?'hsl(31 38% '+(shade+6)+'%)':'hsl(155 18% '+shade+'%)';
    ctx.fillRect(shade,0,1,1);
  }
  return new Uint32Array(ctx.getImageData(0,0,101,1).data.buffer);
}

// Scan across each triangle at pixel centers. A shared edge is included on
// its left/top side only. Depth is linear under the orthographic projection.
function paintMesh(mesh,w,h,turn,tilt,zoom,colors,pixels,depth,pickBuffer,highlight) {
  pixels.fill(0);
  pickBuffer?.fill(-1);
  depth.fill(-Infinity);
  const c=Math.cos(turn),s=Math.sin(turn),ct=Math.cos(tilt),st=Math.sin(tilt);
  const scale=Math.min(w,h)*.30*zoom;
  function project(i) {
    const x=mesh[i],y=mesh[i+1],z=mesh[i+2],horizontal=y*c-x*s;
    return [w/2+(x*c+y*s)*scale,h/2-(z*ct+horizontal*st)*scale,(z*st-horizontal*ct)*scale];
  }
  for(let i=0;i<mesh.length;i+=9) {
    const a=project(i),b=project(i+3),d=project(i+6);
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
    const vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    if(Math.abs(nz)<1e-10) continue;
    // Screen Y grows down, so the upward component of the light is negative.
    const light=(-.38*nx-.56*ny+.72*nz)*Math.sign(nz)/Math.hypot(nx,ny,nz);
    const color=highlight?.has(i/9)?0xff399beb:colors[38+Math.round(22*light)];
    const dzdx=-nx/nz,dzdy=-ny/nz;
    const [top,mid,bottom]=[a,b,d].sort((p,q)=>p[1]-q[1]);
    const end=Math.min(h,Math.ceil(bottom[1]-.5));
    for(let row=Math.max(0,Math.ceil(top[1]-.5));row<end;row++) {
      const y=row+.5;
      const start=y<mid[1]?top:mid,stop=y<mid[1]?mid:bottom;
      const x1=top[0]+(y-top[1])/(bottom[1]-top[1])*(bottom[0]-top[0]);
      const x2=start[0]+(y-start[1])/(stop[1]-start[1])*(stop[0]-start[0]);
      const first=Math.max(0,Math.ceil(Math.min(x1,x2)-.5));
      const last=Math.min(w,Math.ceil(Math.max(x1,x2)-.5));
      let z=a[2]+(first+.5-a[0])*dzdx+(y-a[1])*dzdy;
      for(let col=first;col<last;col++,z+=dzdx) {
        const k=row*w+col;
        if(z<=depth[k]) continue;
        depth[k]=z;pixels[k]=color;
        if(pickBuffer) pickBuffer[k]=i/9;
      }
    }
  }
}

function createMeshViewer(modelCanvas) {
  let currentMesh, timber = false, turn = -.58, tilt = .36, zoom = 1;
  let paintPending = false, axes=false;
  function drawAxes(ctx,h){
    if(!axes)return;
    const c=Math.cos(turn),s=Math.sin(turn),t=Math.sin(tilt);
    ctx.save();ctx.translate(55,h-55);ctx.lineWidth=3;ctx.font='bold 16px sans-serif';
    for(const [name,color,x,y] of [['X','#bd432e',c,s*t],['Y','#278349',s,-c*t],['Z','#326ca9',0,-Math.cos(tilt)]]){
      ctx.strokeStyle=ctx.fillStyle=color;
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(x*35,y*35);ctx.stroke();ctx.fillText(name,x*43-4,y*43+5);
    }
    ctx.restore();
  }
  const palettes=[viewerColors(false),viewerColors(true)];
  let frame,pixels,depth,pickBuffer,onPick,highlight;
  function resetCamera() {
    turn=-.58; tilt=.36; zoom=1;
    schedulePaint();
  }
  function schedulePaint() {
    if(paintPending) return;
    paintPending=true;
    requestAnimationFrame(()=>{
      paintPending=false;
      const ctx=modelCanvas.getContext('2d'), w=modelCanvas.width, h=modelCanvas.height;
      if(!currentMesh) {ctx.clearRect(0,0,w,h);drawAxes(ctx,h);return;}
      if(!frame || frame.width!==w || frame.height!==h) {
        frame=ctx.createImageData(w,h);
        pixels=new Uint32Array(frame.data.buffer);
        depth=new Float64Array(w*h);
        pickBuffer=new Int32Array(w*h);
      }
      paintMesh(currentMesh,w,h,turn,tilt,zoom,palettes[Number(timber)],pixels,depth,pickBuffer,highlight);
      ctx.putImageData(frame,0,0);
      drawAxes(ctx,h);
    });
  }
  let rotationPointer=null, lastX=0,lastY=0,travel=0;
  modelCanvas.onpointerdown=e=>{
    if(!currentMesh || rotationPointer!==null || e.button!==0) return;
    rotationPointer=e.pointerId;travel=0;lastX=e.clientX;lastY=e.clientY;modelCanvas.setPointerCapture(e.pointerId);
  };
  modelCanvas.onpointermove=e=>{
    if(rotationPointer!==e.pointerId) return;
    travel+=Math.hypot(e.clientX-lastX,e.clientY-lastY);
    turn-=(e.clientX-lastX)*.012;
    tilt+=(e.clientY-lastY)*.012;
    lastX=e.clientX;lastY=e.clientY;schedulePaint();
  };
  modelCanvas.onlostpointercapture=()=>{rotationPointer=null;};
  modelCanvas.onpointerup=e=>{
    if(e.pointerId!==rotationPointer || !onPick || travel>4 || !pickBuffer || !currentMesh) return;
    const box=modelCanvas.getBoundingClientRect();
    const x=Math.floor((e.clientX-box.left)*frame.width/box.width);
    const y=Math.floor((e.clientY-box.top)*frame.height/box.height);
    if(x>=0 && y>=0 && x<frame.width && y<frame.height) {
      const triangle=pickBuffer[y*frame.width+x];
      if(triangle>=0) onPick(triangle);
    }
  };
  modelCanvas.addEventListener('wheel',e=>{
    if(!currentMesh) return;
    e.preventDefault();zoom=Math.max(.35,Math.min(3,zoom*Math.exp(-e.deltaY*.001)));
    schedulePaint();
  },{passive:false});
  return {
    resetCamera,
    setAxes(value){axes=value;schedulePaint();},
    onFacePick(callback) {onPick=callback;},
    setHighlight(indices) {highlight=new Set(indices);schedulePaint();},
    setMesh(mesh, wood = false) {
      currentMesh = mesh; timber = wood; schedulePaint();
    }
  };
}

if(typeof module!=='undefined') module.exports={paintMesh};
