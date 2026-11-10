// Road network generation - faithful port of Spawner.cpp
// Algorithm: priority queue exploration guided by simplex noise heatmap

import { SimplexNoise, seededRandom } from './noise.js';
import { segIntersect, normalize, dist, mid, rot2, add, scale, dot, rot90, rot270, getNormal } from './utils.js';

const DEG = Math.PI / 180;

export function generateRoads(cfg) {
  const {
    seed = 42, noiseScale = 0.00003, length = 400,
    primaryStep = 5000, secondaryStep = 3000,
    changeIntensity = 30, secondaryChangeIntensity = 45,
    maxMainLen = 15, maxSecondaryLen = 8,
    mainBranchChance = 0.3, mainAdvantage = 0.1,
    standardWidth = 200, maxAttach = 2000,
    mainRoadDetrimentRange = 1000000,
    mainRoadDetrimentImpact = 0.01,
    closeMiddle = 4000
  } = cfg;

  const rng = seededRandom(seed);
  const noise = new SimplexNoise(seed);
  const noiseAt = (x, y) => noise.noise(x * noiseScale, y * noiseScale);

  const decided = [];
  const queue = new MinHeap(s => s.time);
  const allSegs = [];

  // Find best initial direction
  let bestVal = -Infinity, bestAngle = 0;
  for (let a = 0; a < 360; a += 1) {
    const dir = rot2({ x: primaryStep, y: 0 }, a * DEG);
    const v = noiseAt(dir.x, dir.y);
    if (v > bestVal) { bestVal = v; bestAngle = a * DEG; }
  }

  // Create start road
  const startRoad = {
    p1: { x: 0, y: 0 },
    p2: add({ x: 0, y: 0 }, rot2({ x: primaryStep, y: 0 }, bestAngle)),
    type: 'main', width: 4, roadInFront: false,
    beginTangent: { x: Math.cos(bestAngle), y: Math.sin(bestAngle) },
    endTangent: { x: Math.cos(bestAngle), y: Math.sin(bestAngle) }
  };
  computeVerts(startRoad, standardWidth);

  const startNode = {
    seg: startRoad, angle: bestAngle,
    time: -10000, roadLen: 1,
    prev: { seg: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } } }
  };
  queue.push(startNode);

  // Main generation loop
  while (queue.size() > 0 && decided.length < length) {
    const cur = queue.pop();
    if (placementOk(decided, cur, standardWidth, closeMiddle)) {
      decided.push(cur.seg);
      if (cur.prev && dist(cur.prev.seg.p2, cur.seg.p1) < 1)
        cur.prev.seg.roadInFront = true;
      addExtensions(queue, cur, allSegs, noiseAt, rng, {
        primaryStep, secondaryStep, maxMainLen, maxSecondaryLen,
        changeIntensity, secondaryChangeIntensity, mainBranchChance,
        mainAdvantage, mainRoadDetrimentRange, mainRoadDetrimentImpact, standardWidth
      });
    }
  }

  attachLooseEnds(decided, maxAttach, standardWidth);
  return decided;
}

function addExtensions(queue, cur, allSegs, noiseAt, rng, cfg) {
  const { primaryStep, secondaryStep, maxMainLen, maxSecondaryLen,
          changeIntensity, secondaryChangeIntensity, mainBranchChance,
          mainAdvantage, mainRoadDetrimentRange, mainRoadDetrimentImpact, standardWidth: sw } = cfg;

  const isMain = cur.seg.type === 'main';
  const mainOthers = isMain ? allSegs.filter(s => s.seg.type === 'main') : [];

  const enq = (relDeg, step, type, w) =>
    enqueue(queue, cur, relDeg, step, type, w,
            isMain ? changeIntensity : secondaryChangeIntensity,
            mainOthers, noiseAt, rng, mainRoadDetrimentRange, mainRoadDetrimentImpact, sw, allSegs, mainAdvantage);

  const sndRoadSize = Math.max(1.9, cur.seg.width - 1.5);
  if (isMain) {
    if (cur.roadLen < maxMainLen) enq(0, primaryStep, 'main', 4);
    const lType = rng() < mainBranchChance ? 'main' : 'secondary';
    const rType = rng() < mainBranchChance ? 'main' : 'secondary';
    enq(90,  lType === 'main' ? primaryStep : secondaryStep, lType, lType === 'main' ? 4 : sndRoadSize);
    enq(-90, rType === 'main' ? primaryStep : secondaryStep, rType, rType === 'main' ? 4 : sndRoadSize);
  } else if (cur.roadLen < maxSecondaryLen) {
    enq(0,   secondaryStep, 'secondary', sndRoadSize);
    enq(90,  secondaryStep, 'secondary', sndRoadSize);
    enq(-90, secondaryStep, 'secondary', sndRoadSize);
  }
}

function enqueue(queue, prev, relDeg, step, type, width, maxChange,
                 others, noiseAt, rng, detrRange, detrImpact, sw, allSegs, mainAdvantage) {
  const baseAngle = prev.angle + relDeg * DEG;

  let p1 = prev.seg.p2;
  if (relDeg !== 0) {
    const startOff = sw * prev.seg.width * 0.5;
    const m = mid(prev.seg.p1, prev.seg.p2);
    p1 = add(m, rot2({ x: startOff, y: 0 }, baseAngle));
  }

  // C++ getBestRotation: compares detriment-adjusted val but stores raw noise as bestVal
  let bestAngle = baseAngle, bestVal = -10000;
  for (let i = 0; i < 7; i++) {
    const a = baseAngle + (rng() * 2 - 1) * maxChange * DEG;
    const testP = add(p1, rot2({ x: step, y: 0 }, a));
    let v = noiseAt(testP.x, testP.y);
    for (const o of others) {
      const d = dist(mid(o.seg.p1, o.seg.p2), testP);
      if (d < detrRange) v -= Math.max(0, detrImpact * (detrRange - d) / detrRange);
    }
    if (v > bestVal) { bestAngle = a; bestVal = noiseAt(testP.x, testP.y); }
  }

  const p2 = add(p1, rot2({ x: step, y: 0 }, bestAngle));
  const tan = normalize(sub2(p2, p1));
  // C++ addRoadSide: beginTangent = FRotator(0, left?90:270, 0).RotateVector(prevSeg->p2 - prevSeg->p1)
  // = perpendicular of parent road direction for side roads (relDeg != 0)
  // C++ addRoadForward: beginTangent = normalize(prevSeg->p2 - prevSeg->p1) = parent road direction
  let beginTangent;
  if (relDeg !== 0) {
    const prevTan = normalize(sub2(prev.seg.p2, prev.seg.p1));
    beginTangent = relDeg > 0 ? { x: -prevTan.y, y: prevTan.x } : { x: prevTan.y, y: -prevTan.x };
  } else {
    beginTangent = normalize(sub2(prev.seg.p2, prev.seg.p1));
  }
  const seg = { p1, p2, type, width, beginTangent, endTangent: tan, roadInFront: false };
  computeVerts(seg, sw);
  const roadLen = (prev.seg.type === 'main' && type !== 'main') ? 1 : prev.roadLen + 1;
  const val = noiseAt(p2.x, p2.y);
  const node = { seg, angle: bestAngle, time: -val + (type === 'main' ? mainAdvantage : 0) + Math.abs(0.1 * prev.time), roadLen, prev };
  queue.push(node);
  allSegs.push(node);
}

function sub2(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }

// C++ addVertices: v1/v2 use beginTangent at p1, v3/v4 use endTangent at p2
function computeVerts(seg, sw) {
  const endTan = normalize(sub2(seg.p2, seg.p1));
  const beginTan = seg.beginTangent ? normalize(seg.beginTangent) : endTan;
  const nBegin = rot90(beginTan);
  const nEnd = rot90(endTan);
  const hw = sw * seg.width * 0.5;
  seg.v1 = add(seg.p1, scale(nBegin, hw));
  seg.v2 = add(seg.p1, scale(nBegin, -hw));
  seg.v3 = add(seg.p2, scale(nEnd, hw));
  seg.v4 = add(seg.p2, scale(nEnd, -hw));
  seg.hw = hw;
}

function placementOk(decided, cur, sw, closeMiddle = 4000) {
  computeVerts(cur.seg, sw);
  for (const f of decided) {
    if (cur.prev && f === cur.prev.seg) continue;
    if (dist(mid(f.p1, f.p2), mid(cur.seg.p1, cur.seg.p2)) < closeMiddle) return false;
    const ix = segIntersect(cur.seg.p1, cur.seg.p2, f.p1, f.p2);
    if (ix) { cur.time = 100000; collide(cur.seg, f, ix, sw); }
  }
  return true;
}

function collide(s1, s2, ip, sw) {
  s1.p2 = ip;
  const nat = normalize(sub2(s1.p2, s1.p1));
  const s2tan = normalize(sub2(s2.p2, s2.p1));
  const pot1 = rot90(s2tan);
  const pot2 = rot270(s2tan);
  const newTan = dist(pot1, nat) < dist(pot2, nat) ? pot1 : pot2;
  if (dot(nat, newTan) > 0.3) {
    s1.endTangent = newTan;
    computeVerts(s1, sw);
  } else {
    // C++: s1->endTangent = -s2->endTangent (fix: was missing in original port)
    s1.endTangent = scale(s2.endTangent, -1);
    s1.v3 = s2.v4; s1.v4 = s2.v3;
    s1.p2 = mid(s2.v4, s2.v3);
    s2.roadInFront = true;
  }
  s1.roadInFront = true;
}

function attachLooseEnds(decided, maxAttach, sw) {
  for (const f2 of decided) {
    if (f2.roadInFront) continue;
    const tan = normalize(sub2(f2.p2, f2.p1));
    const origP2 = { ...f2.p2 };
    const extP2 = add(f2.p2, scale(tan, maxAttach));
    let closestD = Infinity, closest = null, impactP = null;
    for (const f of decided) {
      if (f === f2) continue;
      const res = segIntersect(origP2, extP2, f.p1, f.p2);
      if (res) {
        const d = dist(origP2, res);
        if (d < closestD) { closestD = d; closest = f; impactP = res; }
      }
    }
    if (closest) collide(f2, closest, impactP, sw);
    else f2.p2 = origP2;
  }
}

class MinHeap {
  constructor(key) { this._d = []; this._key = key; }
  size() { return this._d.length; }
  push(v) {
    this._d.push(v);
    let i = this._d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._key(this._d[p]) <= this._key(this._d[i])) break;
      [this._d[p], this._d[i]] = [this._d[i], this._d[p]]; i = p;
    }
  }
  pop() {
    const top = this._d[0];
    const last = this._d.pop();
    if (this._d.length > 0) {
      this._d[0] = last;
      let i = 0;
      while (true) {
        let s = i;
        const l = 2*i+1, r = 2*i+2;
        if (l < this._d.length && this._key(this._d[l]) < this._key(this._d[s])) s = l;
        if (r < this._d.length && this._key(this._d[r]) < this._key(this._d[s])) s = r;
        if (s === i) break;
        [this._d[s], this._d[i]] = [this._d[i], this._d[s]]; i = s;
      }
    }
    return top;
  }
}
