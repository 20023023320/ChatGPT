'use strict';

function inferSketch(lines, mode, left) {
  const unknown = {type: '', ratios: {}, hint: '请选择零件模板，再填写实际尺寸。'};
  if (mode !== 'plane') return unknown;
  function loop(line) {
    if (line.length < 4) return null;
    const {left:x,top:y,width:w,height:h} = SketchMatcher.bounds([line]);
    if (!w || !h) return null;
    const first = line[0], last = line[line.length-1];
    if (Math.hypot(first[0]-last[0],first[1]-last[1]) > .17*Math.max(w,h)) return null;
    let area = 0;
    line.forEach(([u,v],i) => {
      const next = line[(i+1)%line.length];
      area += u*next[1]-v*next[0];
    });
    return {x:x+w/2,y:y+h/2,w,h,fill:Math.abs(area)/(2*w*h)};
  }
  const loops = lines.map(loop).filter(Boolean).sort((a,b) => b.w*b.h-a.w*a.h);
  if (!loops.length || loops.length !== lines.length) return unknown;
  const [outer,...holes] = loops;
  if (holes.some(p => 2*Math.abs(p.x-outer.x)+p.w >= outer.w || 2*Math.abs(p.y-outer.y)+p.h >= outer.h)) return unknown;
  const round = p => Math.min(p.w,p.h)/Math.max(p.w,p.h) > .68 && p.fill > .52 && p.fill < .9;
  if (round(outer)) {
    const span=(outer.w+outer.h)/2;
    const radial=p=>Math.hypot(p.x-outer.x,p.y-outer.y);
    const center=holes.find(p=>round(p) && radial(p)<.08*span);
    const bolts=holes.filter(p=>p!==center);
    let type='flat';
    if (left?.length) {
      const ranks=SketchMatcher.rankWithLeft([{id:'FL-01',view:'front',distance:0},{id:'FL-02',view:'front',distance:0}],left);
      if (ranks[0]?.id==='FL-02') type='boss';
    }
    const ratios={};
    if(center) ratios.B=(center.w+center.h)/(2*span);
    if(bolts.length>=3 && bolts.length<=16 && bolts.every(p=>round(p) && radial(p)>.12*span)) {
      const radius=bolts.reduce((sum,p)=>sum+radial(p),0)/bolts.length;
      const angles=bolts.map(p=>Math.atan2(p.y-outer.y,p.x-outer.x)).sort((a,b)=>a-b);
      const pitch=2*Math.PI/bolts.length;
      const uniform=angles.every((a,i)=>Math.abs((angles[i+1]??angles[0]+2*Math.PI)-a-pitch)<pitch*.35);
      if(uniform && bolts.every(p=>Math.abs(radial(p)-radius)<.22*radius)) {
        ratios.PCD=2*radius/span;
        ratios.Hole=bolts.reduce((sum,p)=>sum+(p.w+p.h)/2,0)/(bolts.length*span);
        ratios.N=bolts.length;
      }
    }
    return {type,ratios,hint:left?.length?'已参考左视轮廓，请核对背面结构。':'请确认法兰背面是否带凸台。'};
  }
  if (outer.fill < .84) return unknown;
  const horizontal=outer.w>=outer.h;
  const length=Math.max(outer.w,outer.h);
  const ratios={W:Math.min(outer.w,outer.h)/length};
  let type;
  if (holes.length===1 && Math.max(holes[0].w,holes[0].h)>1.6*Math.min(holes[0].w,holes[0].h)) {
    type='slot'; ratios.SL=Math.max(holes[0].w,holes[0].h)/length; ratios.SW=Math.min(holes[0].w,holes[0].h)/length;
  } else if ([2,4].includes(holes.length) && holes.every(round)) {
    type=holes.length===2?'two':'four';
    const span=key=>Math.max(...holes.map(p=>p[key]))-Math.min(...holes.map(p=>p[key]));
    ratios.X=span(horizontal?'x':'y')/length;
    if(type==='four') ratios.Y=span(horizontal?'y':'x')/length;
    ratios.Hole=holes.reduce((s,p)=>s+(p.w+p.h)/2,0)/(holes.length*length);
  } else return unknown;
  return {type,ratios,hint:'已按可见轮廓推荐模板，请核对孔位与实际尺寸。'};
}
