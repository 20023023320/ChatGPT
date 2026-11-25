'use strict';

const FreeProfile = (() => {
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function fail(message,...points) {
    const error=new Error(message);
    error.points=points;
    throw error;
  }
  function extent(points) {
    let left=Infinity, right=-Infinity, top=Infinity, bottom=-Infinity;
    for(const [x,y] of points) {
      left=Math.min(left,x); right=Math.max(right,x);
      top=Math.min(top,y); bottom=Math.max(bottom,y);
    }
    return {left,top,width:right-left,height:bottom-top};
  }
  function signedArea(ring) {
    return ring.reduce((area,p,i)=>area+cross([0,0],p,ring[(i+1)%ring.length]),0)/2;
  }
  // Visit actual intersections in canvas coordinates, including touching endpoints.
  function crossings(edges,visit) {
    const left=e=>Math.min(e.a[0],e.b[0]);
    edges.sort((a,b)=>left(a)-left(b));
    for(let i=0;i<edges.length;i++) {
      const e=edges[i],{a,b}=e;
      for(let j=i+1;j<edges.length;j++) {
        const f=edges[j],{a:c,b:d}=f;
        if(left(f)>Math.max(a[0],b[0])) break;
        if(Math.max(a[1],b[1])<Math.min(c[1],d[1]) || Math.max(c[1],d[1])<Math.min(a[1],b[1])) continue;
        const s=cross(a,b,c), t=cross(a,b,d);
        if(s*t>0 || cross(c,d,a)*cross(c,d,b)>0) continue;
        if(s===t) {
          const ends=[a,b,c,d].sort((p,q)=>p[0]-q[0] || p[1]-q[1]);
          visit(e,f,ends[1],distance(ends[1],ends[2])>1e-7);
        } else {
          const u=s/(s-t);
          visit(e,f,u===0?c:u===1?d:[c[0]+u*(d[0]-c[0]),c[1]+u*(d[1]-c[1])],false);
        }
      }
    }
  }
  function connect(a,b,via=[]) {
    const edge={a,b,via};
    a.edges.add(edge);b.edges.add(edge);
  }
  const other=(edge,node)=>edge.a===node?edge.b:edge.a;
  function strokeGraph(strokes) {
    const nodes=new Map();
    function node(point) {
      const key=Math.round(point[0]*1e7)+','+Math.round(point[1]*1e7);
      if(!nodes.has(key)) nodes.set(key,{point,edges:new Set()});
      return nodes.get(key);
    }
    const segments=[];
    for(const stroke of strokes) {
      const line=stroke.map(node).filter((v,i,vs)=>!i || v!==vs[i-1]);
      if(line.length<2) fail('这段笔迹过短，请重新绘制。',...stroke.slice(0,1));
      for(let i=1;i<line.length;i++) {
        const prev=line[i-1],next=line[i];
        segments.push({a:prev.point,b:next.point,cuts:new Set([prev,next])});
      }
    }
    crossings(segments,(e,f,point,overlap)=>{
      if(overlap) fail('笔迹在标记处折返或重叠，请重画这段轮廓。',point);
      const v=node(point);
      e.cuts.add(v);f.cuts.add(v);
    });
    for(const {a,cuts} of segments) {
      const ordered=[...cuts].sort((p,q)=>distance(p.point,a)-distance(q.point,a));
      for(let i=1;i<ordered.length;i++) connect(ordered[i-1],ordered[i]);
    }
    return [...nodes.values()];
  }
  // A connected undirected component with as many edges as vertices has
  // exactly one cycle. Removing its leaves cannot change that contour.
  function trimCycleBranches(nodes) {
    const tails=[],seen=new Set();
    for(const start of nodes) {
      if(seen.has(start)) continue;
      const component=[start];
      seen.add(start);
      let degreeSum=0;
      for(const at of component) {
        degreeSum+=at.edges.size;
        for(const edge of at.edges) {
          const next=other(edge,at);
          if(!seen.has(next)) {seen.add(next);component.push(next);}
        }
      }
      if(degreeSum!==2*component.length) continue;
      const tips=component.filter(v=>v.edges.size===1);
      for(const tip of tips) {
        if(tip.edges.size!==1) continue;
        const points=[tip.point];
        let at=tip;
        while(at.edges.size===1) {
          const edge=at.edges.values().next().value;
          const next=other(edge,at);
          edge.a.edges.delete(edge);edge.b.edges.delete(edge);
          points.push(next.point);
          at=next;
        }
        tails.push(points);
      }
    }
    return tails;
  }
  function trimTails(nodes,limit) {
    const tails=trimCycleBranches(nodes),atJunction=new Map();
    // Open components still need their endpoints to close genuine gaps.
    // Only trim an unambiguous short overrun here.
    for(const tip of nodes.filter(n=>n.edges.size===1)) {
      const points=[tip.point], edges=[];
      let at=tip,length=0,edge=[...tip.edges][0];
      while(edge) {
        const next=other(edge,at);
        length+=distance(at.point,next.point);
        if(length>limit) break;
        points.push(next.point);edges.push(edge);
        if(next.edges.size>=3) {
          if(!atJunction.has(next)) atJunction.set(next,[]);
          atJunction.get(next).push({points,edges});
          break;
        }
        if(next.edges.size!==2) break;
        at=next;
        edge=[...at.edges].find(e=>e!==edge);
      }
    }
    for(const [node,branches] of atJunction) {
      if(node.edges.size-branches.length!==2) fail('这里有多个可能的轮廓，请分开标记处的线段。',node.point);
      for(const branch of branches) {
        tails.push(branch.points);
        for(const edge of branch.edges) {edge.a.edges.delete(edge);edge.b.edges.delete(edge);}
      }
    }
    return tails;
  }
  function bridge(from,to) {
    const a=from.point,b=to.point,d=distance(a,b);
    const start=other([...from.edges][0],from).point,end=other([...to.edges][0],to).point;
    function direction(p,q) {
      const length=distance(p,q);
      return [(q[0]-p[0])/length,(q[1]-p[1])/length];
    }
    const s=direction(start,a),t=direction(b,end),chord=direction(a,b);
    const dot=(u,v)=>u[0]*v[0]+u[1]*v[1];
    // Straight connections preserve a sharp corner when one tangent is transverse.
    if(d<1 || dot(s,chord)<.5 || dot(t,chord)<.5 || dot(s,t)<.3 ||
       (dot(s,chord)>.9999 && dot(t,chord)>.9999)) return [a,b];
    const points=[a];
    for(let i=1;i<4;i++) {
      const v=i/4,u=1-v;
      points.push(a.map((coord,k)=>u*u*(1+2*v)*coord+v*v*(1+2*u)*b[k]+d*u*v*(u*s[k]-v*t[k])));
    }
    points.push(b);
    return points;
  }
  function bridgeEnds(nodes,limit) {
    const tips=nodes.filter(n=>n.edges.size===1);
    // Bound each gap by its local strokes as well as by the canvas tolerance.
    // A large outer rectangle must not close a missing side of a tiny hole.
    const spans=new Map();
    for(const tip of tips) {
      if(spans.has(tip)) continue;
      const chain=[tip];
      let node=tip,previous=null;
      while(true) {
        const edge=[...node.edges].find(e=>e!==previous);
        if(!edge) break;
        node=other(edge,node);
        chain.push(node);
        previous=edge;
      }
      const box=extent(chain.map(n=>n.point));
      const span=Math.max(box.width,box.height);
      spans.set(tip,span);spans.set(node,span);
    }
    const pairs=new Map();
    for(const tip of tips) {
      const near=tips.filter(n=>n!==tip && distance(tip.point,n.point)<=
        Math.min(limit,.13*Math.max(spans.get(tip),spans.get(n))));
      if(!near.length) fail('轮廓有断口，请连接标记处的端点。',tip.point);
      if(near.length>1) fail('断口附近有多个端点，请明确连接标记处的线段。',tip.point,...near.map(n=>n.point));
      pairs.set(tip,near[0]);
    }
    const bridges=[];
    for(const [a,b] of pairs) {
      const points=bridge(a,b);
      connect(a,b,points.slice(1,-1));
      pairs.delete(b);
      bridges.push(points);
    }
    return bridges;
  }
  function readRings(nodes) {
    const rings=[],seen=new Set();
    for(const start of nodes) {
      let at=start,edge=[...at.edges].find(e=>!seen.has(e));
      if(!edge) continue;
      const points=[at.point];
      while(edge) {
        seen.add(edge);
        points.push(...(edge.a===at?edge.via:[...edge.via].reverse()));
        at=other(edge,at);
        if(at===start) break;
        points.push(at.point);
        edge=[...at.edges].find(e=>!seen.has(e));
      }
      rings.push(points);
    }
    return rings;
  }
  function contains(ring,p) {
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[i],b=ring[j];
      if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<a[0]+(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])) inside=!inside;
    }
    return inside;
  }
  function intersections(rings) {
    const edges=rings.flatMap(ring=>ring.map((a,i)=>({a,b:ring[(i+1)%ring.length],ring,i})));
    crossings(edges,(a,b,point,overlap)=>{
      const step=Math.abs(a.i-b.i);
      if(!overlap && a.ring===b.ring && (step===1 || step===a.ring.length-1)) return;
      fail('轮廓在标记处交叉或相碰，请分开后重试。',point);
    });
  }
  function repair(strokes) {
    if(!strokes.length) fail('请先绘制闭合轮廓。');
    const nodes=strokeGraph(strokes);
    const box=extent(nodes.map(n=>n.point));
    const limit=Math.min(14,.13*Math.max(box.width,box.height));
    const tails=trimTails(nodes,limit);
    const crossing=nodes.find(n=>n.edges.size>2);
    if(crossing) fail('轮廓在标记处交叉或相碰，请分开后重试。',crossing.point);
    const bridges=bridgeEnds(nodes,limit);
    const rings=readRings(nodes).map(points=>{
      return points.filter((p,i)=>{
        const before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length];
        if(cross(before,p,after)!==0) return true;
        if((before[0]-p[0])*(after[0]-p[0])+(before[1]-p[1])*(after[1]-p[1])>0)
          fail('笔迹在标记处折返重叠，请重画这段轮廓。',p);
        return false;
      });
    });
    // Every boundary edge needs two wall triangles. Each cap needs at least n-2.
    const vertices=rings.reduce((n,r)=>n+r.length,0);
    if(4*vertices-4>30000) fail('模型超过 3 万个三角面，请简化轮廓。');
    intersections(rings);
    for(const ring of rings) if(ring.length<3 || Math.abs(signedArea(ring))<.5)
      fail('轮廓面积过小，请放大后重新绘制。',ring[0] || strokes[0][0]);
    rings.sort((a,b)=>Math.abs(signedArea(b))-Math.abs(signedArea(a)));
    const [outer,...holes]=rings;
    for(const hole of holes) {
      if(!contains(outer,hole[0])) fail('每个模型需要一个外轮廓。标记处是独立轮廓。',hole[0]);
      if(holes.some(other=>other!==hole && contains(other,hole[0]))) fail('孔中还有封闭区域，请移除标记处的嵌套轮廓。',hole[0]);
    }
    // Canvas Y points down. Clockwise in sketch coordinates becomes CCW in XZ.
    return {rings:rings.map(ring=>signedArea(ring)>0?ring.reverse():ring),bridges,tails};
  }
  return {repair,prepare:strokes=>repair(strokes).rings,extent};
})();

if(typeof module!=='undefined') module.exports=FreeProfile;
