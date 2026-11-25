'use strict';

// Approximate strokes independent of the reference drawings, in canvas coordinates.
const flangeSamples = (() => {
  const ring = (x, y, w, h) =>
    [[0,-1],[.47,-.88],[.84,-.57],[1,-.12],[.96,.29],[.68,.75],[.22,.96],
      [-.24,1],[-.70,.72],[-.96,.32],[-1,-.14],[-.83,-.59],[-.46,-.89],[0,-1]]
      .map(([u,v]) => [x+u*w,y+v*h]);
  return {
    front: [ring(92,92,69,70),ring(92,92,17,16),
      ring(48,93,7,7),ring(135,92,7,6),ring(92,47,6,7),ring(92,136,7,7)],
    flat: [[[31,16],[49,18],[50,155],[32,158],[31,16]]],
    boss: [[[32,15],[49,17],[50,51],[74,53],[73,115],[50,117],[48,156],[31,157],[32,15]],
      [[50,54],[49,113]]]
  };
})();
if (typeof module !== 'undefined') module.exports = flangeSamples;
