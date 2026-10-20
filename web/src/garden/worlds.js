import * as THREE from 'three';
import { PALETTE } from './materials.js';
import {
  bamboo, drifters, eggshell, koi, lantern, maple, mossMound, peaks, pavilion, plinth, pond, sprout, stone, waterfall,
} from './props.js';

/**
 * One garden per companion per life stage. Each layout returns the scene
 * group plus the "affordances" the companion's behaviour uses: where the
 * water is, which stones can be basked on, which bamboo can be climbed or
 * eaten, where to nap, and what's in the way.
 */

const STAGE_RADIUS = { 1: 2.2, 2: 2.8, 3: 3.4, 4: 4.0 };

function layout(companion, stage) {
  const L = { ponds: [], stones: [], bamboo: [], moss: [], lanterns: [], trees: [], sprouts: [], extras: [] };
  const P = (x, z, r, opts = {}) => L.ponds.push({ x, z, r, ...opts });
  const S = (x, z, r, opts = {}) => L.stones.push({ x, z, r, ...opts });
  const B = (x, z, h) => L.bamboo.push({ x, z, h });
  const M = (x, z, r, nap = false) => L.moss.push({ x, z, r, nap });

  if (companion === 'turtle') {
    if (stage === 1) {
      P(0.75, -0.45, 0.55);
      S(-0.95, -0.6, 0.25, { bask: true });
      M(1.25, 0.65, 0.22);
      L.sprouts.push([-0.45, -0.95], [-0.62, -0.82]);
      L.extras.push('eggshell');
    } else if (stage === 2) {
      P(0.8, -0.4, 0.95, { lilies: 2 });
      S(-1.2, -0.8, 0.32, { bask: true });
      S(-0.35, -1.55, 0.2);
      M(1.7, 0.95, 0.3);
      M(-1.75, 0.55, 0.28);
      L.sprouts.push([-1.6, -0.2], [0.2, -1.8]);
    } else if (stage === 3) {
      P(0.85, -0.55, 1.35, { lilies: 3, koi: 2 });
      S(-1.45, 0.15, 0.42, { bask: true });
      S(0.15, -2.35, 0.3);
      L.lanterns.push([-1.6, -1.5]);
      B(-2.5, -1.2, 1.5);
      B(-2.25, -1.65, 1.8);
      M(2.4, 1.0, 0.35);
      M(-2.2, 1.3, 0.3);
    } else {
      P(0.65, -0.65, 1.8, { lilies: 4, koi: 3, deep: true, island: [1.0, -0.9] });
      L.extras.push('waterfall');
      S(-1.25, -0.2, 0.46, { bask: true });
      S(-2.6, -1.9, 0.34);
      L.lanterns.push([-1.7, 1.05]);
      L.trees.push([-2.55, -0.9, 1.15]);
      M(2.75, 1.35, 0.4);
      M(-0.4, 2.6, 0.3);
      L.extras.push('leaves');
    }
  } else {
    if (stage === 1) {
      B(-0.7, -0.6, 0.55);
      B(-0.42, -0.92, 0.42);
      M(0.85, -0.45, 0.32, true);
      S(1.05, 0.55, 0.2);
      L.sprouts.push([-0.95, -0.25]);
    } else if (stage === 2) {
      for (const [x, z, h] of [[-1.5, -1.2, 1.3], [-0.9, -1.75, 1.6], [-0.2, -2.0, 1.2], [-1.95, -0.5, 1.1], [0.55, -2.05, 1.45]]) B(x, z, h);
      M(1.35, 0.25, 0.4, true);
      for (const [x, z] of [[0.2, 1.4], [0.55, 0.85], [0.75, 0.25]]) S(x, z, 0.16, { flat: true });
      L.sprouts.push([1.6, -1.0]);
    } else if (stage === 3) {
      const ring = [[-2.4, -0.4], [-2.2, -1.2], [-1.7, -1.9], [-1.0, -2.4], [-0.2, -2.7], [0.6, -2.6], [-2.6, 0.4], [-1.4, -2.7], [0.1, -2.1], [-1.9, -0.9]];
      ring.forEach(([x, z], i) => B(x, z, 1.5 + ((i * 37) % 9) / 10));
      L.lanterns.push([1.8, -1.2]);
      M(1.2, 0.2, 0.45, true);
      P(1.55, 1.25, 0.62, { lilies: 1 });
      for (const [x, z] of [[-0.6, 1.6], [-0.4, 1.0], [-0.1, 0.45], [0.1, -0.2]]) S(x, z, 0.17, { flat: true });
    } else {
      L.extras.push('peaks');
      L.extras.push('pavilion');
      for (const [x, z, h] of [[-2.9, -0.2, 2.1], [-2.6, -1.1, 2.4], [-2.1, -1.8, 1.9], [-3.1, 0.7, 1.8], [-2.4, 1.4, 1.6], [-1.6, -2.4, 2.2]]) B(x, z, h);
      P(2.2, 1.05, 0.75, { koi: 1, lilies: 1 });
      L.lanterns.push([0.15, -2.2]);
      L.trees.push([2.6, -1.4, 0.95]);
      M(-0.9, 0.9, 0.42, true);
      for (const [x, z] of [[0.9, 2.2], [0.95, 1.5], [1.05, 0.8]]) S(x, z, 0.18, { flat: true });
      L.extras.push('leaves-bamboo');
    }
  }
  return L;
}

export function buildWorld(companion, stage, { night = false, seed = 1 } = {}) {
  const radius = STAGE_RADIUS[stage] ?? 3;
  const L = layout(companion, stage);
  const root = new THREE.Group();
  const updaters = [];
  const track = (obj) => {
    if (obj.userData?.update) updaters.push(obj.userData.update);
    return obj;
  };

  const ringFeatures = [
    ...L.ponds.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.05 })),
    ...L.stones.filter((s) => !s.flat).map((s) => ({ x: s.x, z: s.z, r: s.r })),
  ];
  root.add(plinth(radius, { features: ringFeatures, seed, night }));

  const affordances = {
    radius,
    water: [],
    baskStones: [],
    bamboo: [],
    napSpots: [],
    seat: null,
    obstacles: [],
    koi: [],
  };

  L.ponds.forEach((p, i) => {
    const pd = track(pond(p.r, { lilies: p.lilies ?? 0, seed: seed + i * 7, deep: p.deep }));
    pd.position.set(p.x, 0, p.z);
    root.add(pd);
    affordances.water.push({ x: p.x, z: p.z, r: p.r, pond: pd });
    for (let k = 0; k < (p.koi ?? 0); k += 1) {
      const fish = track(koi(p.r, { seed: seed + 40 + k, white: k === 1 }));
      pd.add(fish);
      affordances.koi.push(fish);
    }
    if (p.island) {
      const isle = stone(0.3, { seed: 77, color: PALETTE.stoneDark });
      isle.position.set(p.island[0], 0, p.island[1]);
      root.add(isle);
      const pine = mossMound(0.18, 78);
      pine.position.set(p.island[0], 0.2, p.island[1]);
      root.add(pine);
    }
  });

  L.stones.forEach((s, i) => {
    const st = stone(s.r, { seed: seed + 100 + i, flat: s.flat ? 0.6 : 0.62, color: PALETTE.stone });
    st.position.set(s.x, 0, s.z);
    root.add(st);
    if (s.bask) affordances.baskStones.push({ x: s.x, z: s.z, r: s.r, top: s.r * 0.62 * 0.9 });
    if (!s.flat) affordances.obstacles.push({ x: s.x, z: s.z, r: s.r + 0.08 });
  });

  L.bamboo.forEach((b, i) => {
    const stalk = track(bamboo(b.h, { seed: seed + 200 + i }));
    stalk.position.set(b.x, 0, b.z);
    root.add(stalk);
    affordances.bamboo.push({ x: b.x, z: b.z, h: b.h, stalk });
    affordances.obstacles.push({ x: b.x, z: b.z, r: 0.14 });
  });

  L.moss.forEach((m, i) => {
    const mound = mossMound(m.r, seed + 300 + i);
    mound.position.set(m.x, 0, m.z);
    root.add(mound);
    if (m.nap) affordances.napSpots.push({ x: m.x, z: m.z });
  });

  L.sprouts.forEach(([x, z], i) => {
    const sp = track(sprout(seed + 400 + i));
    sp.position.set(x, 0, z);
    root.add(sp);
  });

  L.lanterns.forEach(([x, z], i) => {
    const lt = track(lantern({ night, light: i === 0 }));
    lt.position.set(x, 0, z);
    root.add(lt);
    affordances.obstacles.push({ x, z, r: 0.28 });
  });

  L.trees.forEach(([x, z, size], i) => {
    const tree = track(maple({ seed: seed + 500 + i, size }));
    tree.position.set(x, 0, z);
    root.add(tree);
    affordances.obstacles.push({ x, z, r: 0.25 });
  });

  for (const extra of L.extras) {
    if (extra === 'eggshell') {
      const e = eggshell(seed + 600);
      e.position.set(-0.15, 0, 0.55);
      root.add(e);
    } else if (extra === 'waterfall') {
      const w = track(waterfall(1.15));
      w.position.set(0.55, 0, -2.45);
      root.add(w);
      affordances.obstacles.push({ x: 0.55, z: -2.45, r: 0.6 });
    } else if (extra === 'peaks') {
      root.add(track(peaks(radius, seed + 700)));
    } else if (extra === 'pavilion') {
      const pv = pavilion();
      pv.position.set(1.35, 0, -1.45);
      pv.rotation.y = -0.35;
      root.add(pv);
      affordances.seat = { x: 1.35, z: -1.45, y: 0.2 };
      affordances.obstacles.push({ x: 1.35 - 0.48, z: -1.45 - 0.3, r: 0.1 }, { x: 1.35 + 0.48, z: -1.45 + 0.3, r: 0.1 });
    } else if (extra === 'leaves' || extra === 'leaves-bamboo') {
      root.add(track(drifters(radius, { night, color: extra === 'leaves' ? PALETTE.maple : PALETTE.bambooLeaf, seed: seed + 800 })));
    }
  }
  if (night && stage >= 2 && !L.extras.some((e) => e.startsWith('leaves'))) {
    root.add(track(drifters(radius, { night: true, count: 10, seed: seed + 900 })));
  }

  /** Is (x, z) open ground the companion can walk to? */
  affordances.isOpen = (x, z, clearance = 0.18) => {
    if (Math.hypot(x, z) > radius - 0.4) return false;
    if (affordances.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + clearance)) return false;
    return !affordances.water.some((w) => Math.hypot(x - w.x, z - w.z) < w.r + 0.05);
  };
  affordances.inWater = (x, z) => affordances.water.find((w) => Math.hypot(x - w.x, z - w.z) < w.r - 0.1) ?? null;
  affordances.clampToPlinth = (v) => {
    const d = Math.hypot(v.x, v.z);
    const max = radius - 0.4;
    if (d > max) {
      v.x *= max / d;
      v.z *= max / d;
    }
    return v;
  };

  return {
    group: root,
    radius,
    affordances,
    update(dt, t, calm) {
      for (const fn of updaters) fn(dt, t, calm);
    },
  };
}
