'use strict';

const SketchMatcher = (() => {
  const groups = {plane:['front','top','left'], solid:['iso','isoFL','isoBR','isoBL']};
  const names = {plane:'平面图',solid:'立体图',front:'正视图',top:'俯视图',left:'左视图',
    iso:'前右上',isoFL:'前左上',isoBR:'后右上',isoBL:'后左上'};
  const linesFor = (part, view) => view === 'front' ? part.strokes : part[view];
  function arc(cx, cy, radius, start, end, steps = 24) {
    return Array.from({ length: steps + 1 }, (_, i) => {
      const angle = start + (end - start) * i / steps;
      return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
  }
  const circle = (x, y, r) => arc(x, y, r, 0, 2 * Math.PI, 40);
  const plate = [[-72,-40],[72,-40],[78,-34],[78,34],[72,40],[-72,40],[-78,34],[-78,-34],[-72,-40]];
  const slot = [...arc(31, 0, 11, -Math.PI/2, Math.PI/2),
    ...arc(-31, 0, 11, Math.PI/2, 3*Math.PI/2), [31,-11]];
  const flatLeft = [[[0,-40],[10,-40],[10,40],[0,40],[0,-40]]];
  const flangeFront = [circle(0,0,40), circle(0,0,10),
    ...[[-25,0],[25,0],[0,-25],[0,25]].map(([x,y]) => circle(x,y,4))];
  const bossLeft = [[[0,-40],[10,-40],[10,-18],[24,-18],[24,18],[10,18],[10,40],[0,40],[0,-40]],
    [[10,-18],[10,18]]];
  const parts = [
    { id: 'PL-01', name: '双圆孔板', strokes: [plate, circle(-39, 0, 12), circle(39, 0, 12)], left: flatLeft },
    { id: 'PL-02', name: '四圆孔板', strokes: [plate, ...[-20,20].flatMap(y => [-48,48].map(x => circle(x, y, 8)))], left: flatLeft },
    { id: 'PL-03', name: '长槽板', strokes: [plate, slot], left: flatLeft },
    { id: 'FL-01', name: '平背法兰', strokes: flangeFront, left: flatLeft },
    { id: 'FL-02', name: '凸台法兰', strokes: flangeFront, left: bossLeft }
  ];

  function bounds(strokes) {
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const stroke of strokes) for (const [x, y] of stroke) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    return { left, top, width: right - left, height: bottom - top };
  }

  // Use arc length rather than pointer-event density to weight the contours.
  function descriptor(strokes) {
    const lines = strokes.filter(stroke => stroke.length > 1);
    const lengths = lines.map(stroke => stroke.slice(1).reduce((sum, [x, y], i) =>
      sum + Math.hypot(x - stroke[i][0], y - stroke[i][1]), 0));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (!total) return [];
    const box = bounds(lines.filter((_, i) => lengths[i] > 0));
    const scale = 1 / Math.max(box.width, box.height);
    const points = [];
    lines.forEach((stroke, k) => {
      if (!lengths[k]) return;
      const step = lengths[k] / Math.max(1, Math.round(320 * lengths[k] / total));
      let next = step / 2, walked = 0;
      for (let i = 1; i < stroke.length; i++) {
        const [x, y] = stroke[i - 1];
        const dx = stroke[i][0] - x, dy = stroke[i][1] - y;
        const length = Math.hypot(dx, dy);
        while (length && next < walked + length) {
          const t = (next - walked) / length;
          points.push([(x + t*dx - box.left - box.width/2)*scale,
            (y + t*dy - box.top - box.height/2)*scale]);
          next += step;
        }
        walked += length;
      }
    });
    return points;
  }

  function directedDistance(a, b) {
    let sum = 0;
    for (const [x, y] of a) {
      let best = Infinity;
      for (const [u, v] of b) {
        const dx = x-u, dy = y-v;
        best = Math.min(best, dx*dx + dy*dy);
      }
      sum += Math.sqrt(best);
    }
    return sum / a.length;
  }
  function distance(a, b) {
    return (directedDistance(a, b) + directedDistance(b, a)) / 2;
  }
  // Built-in drawings use visible edges only. STL parts supply projected geometry.
  for (const part of parts) {
    part.category=part.id.startsWith('FL')?'盘环类':'板类';
    if (part.id.startsWith('FL')) {
      part.top = part.left.map(line => line.map(([depth,z])=>[z,-depth]));
    } else {
      part.top = [[[-78,0],[78,0],[78,-10],[-78,-10],[-78,0]]];
    }
  }
  function viewIndex(part) {
    const indexed={};
    for(const view of [...groups.plane,...groups.solid]) {
      const lines=linesFor(part,view);
      if(lines?.length) indexed[view]=descriptor(lines);
    }
    return indexed;
  }
  const index = new Map(parts.map(part => [part.id,viewIndex(part)]));
  function rank(strokes, view = 'front', category = '') {
    const points = descriptor(strokes);
    if (!points.length) return [];
    const views=groups[view] || (Array.isArray(view) ? view : [view]);
    const result=[];
    for(const part of parts) {
      if(category && part.category!==category) continue;
      const id=part.id, indexed=index.get(id);
      let best=null;
      for(const direction of views) {
        if(!indexed[direction]?.length) continue;
        const d=distance(points,indexed[direction]);
        if(!best || d<best.distance) best={id,view:direction,distance:d};
      }
      if(best) result.push(best);
    }
    return result.sort((a,b)=>a.distance-b.distance);
  }
  function nearby(first, second) {
    if (!first || !second) return false;
    // Prototype decision margin in units of normalized sketch width/height.
    return second.distance - first.distance <= Math.max(.001, first.distance * .12);
  }
  function suggestLeft(ranking) {
    if (ranking.length < 2 || ranking.slice(0,2).some(item=>item.view==='left') || !nearby(ranking[0], ranking[1])) return false;
    return distance(index.get(ranking[0].id).left, index.get(ranking[1].id).left) > .01;
  }
  function rankWithLeft(frontRanking, leftStrokes) {
    const points = descriptor(leftStrokes);
    if (!points.length) return [];
    // Keep every candidate: the extra view may correct a first-view mistake.
    return frontRanking.map(item => ({
      id: item.id, view: item.view,
      distance: (item.distance + distance(points, index.get(item.id).left)) / 2
    })).sort((a,b) => a.distance - b.distance);
  }
  function checkedIndex(part) {
    const indexed=viewIndex(part);
    if (!indexed.front?.length || !indexed.left?.length) throw new Error('模型缺少可检索的正视或左视轮廓');
    return indexed;
  }
  function replacePart(part) {
    const position = parts.findIndex(item => item.id === part.id);
    if(position < 0) throw new Error('找不到要更新的零件');
    index.set(part.id, checkedIndex(part));
    parts[position] = part;
  }
  function addPart(part) {
    if (index.has(part.id)) throw new Error('此零件编号已存在');
    index.set(part.id, checkedIndex(part));
    parts.push(part);
  }
  return { parts, bounds, rank, suggestLeft, rankWithLeft, nearby, addPart,replacePart,groups,names,linesFor };
})();
if (typeof module !== 'undefined') module.exports = SketchMatcher;
