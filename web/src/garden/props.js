import * as THREE from 'three';
import { PALETTE, inked, plain, toon } from './materials.js';

const TAU = Math.PI * 2;

/** Deterministic randomness so a garden looks the same on every visit. */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Raked gravel drawn onto a canvas: parallel rake lines across the bed,
 * bending into concentric rings around every stone and pond, the way a
 * karesansui garden is raked by hand.
 */
function rakedGravelTexture(radius, features, rand, night) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const toPx = (v) => ((v + radius) / (radius * 2)) * size;
  const scale = size / (radius * 2);

  ctx.fillStyle = hex(PALETTE.gravel);
  ctx.fillRect(0, 0, size, size);
  // grain
  for (let i = 0; i < 9000; i += 1) {
    const g = rand();
    ctx.fillStyle = g < 0.5 ? 'rgba(90,96,88,0.10)' : 'rgba(255,255,255,0.22)';
    ctx.fillRect(rand() * size, rand() * size, 1.4, 1.4);
  }

  const spacing = 0.16 * scale;
  const ringZone = (f) => f.r + 0.55;
  const insideRing = (x, z) => features.some((f) => Math.hypot(x - f.x, z - f.z) < ringZone(f));

  const stroke = (draw) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(120,126,116,0.55)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    draw(0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    draw(2.2);
    ctx.stroke();
  };

  // Parallel rake lines, broken wherever a ring takes over.
  for (let py = spacing / 2; py < size; py += spacing) {
    stroke((offset) => {
      let drawing = false;
      for (let px = 0; px <= size; px += 4) {
        const x = px / scale - radius;
        const z = (py + offset) / scale - radius;
        const wobble = Math.sin(px * 0.02 + py * 0.3) * 0.6;
        if (insideRing(x, z)) {
          drawing = false;
          continue;
        }
        if (!drawing) ctx.moveTo(px, py + offset + wobble);
        else ctx.lineTo(px, py + offset + wobble);
        drawing = true;
      }
    });
  }
  // Rings around each feature.
  for (const f of features) {
    for (let r = f.r + 0.12; r < ringZone(f); r += 0.13) {
      stroke((offset) => ctx.arc(toPx(f.x), toPx(f.z), r * scale + offset, 0, TAU));
    }
  }

  if (night) {
    ctx.fillStyle = 'rgba(20,30,40,0.35)';
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The floating stone plinth that every garden sits on, with its raked gravel top. */
export function plinth(radius, { features = [], seed = 1, night = false } = {}) {
  const rand = seeded(seed);
  const group = new THREE.Group();
  const height = 0.34;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.94, height, 72, 1),
    toon(PALETTE.plinth),
  );
  base.position.y = -height / 2;
  base.receiveShadow = true;
  group.add(base);

  const lip = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.02, 0.06, 8, 96), toon(PALETTE.plinthDark));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.01;
  group.add(lip);

  const top = new THREE.Mesh(
    new THREE.CircleGeometry(radius - 0.05, 96),
    new THREE.MeshToonMaterial({ map: rakedGravelTexture(radius - 0.05, features, rand, night) }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.012;
  top.receiveShadow = true;
  group.add(top);

  // A soft contact shadow under the floating plinth.
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    grad.addColorStop(0, 'rgba(20,28,24,0.32)');
    grad.addColorStop(1, 'rgba(20,28,24,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2.6, radius * 2.6),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -height - 0.35;
  group.add(shadow);

  group.userData.top = top;
  return group;
}

export function stone(size = 0.3, { seed = 2, color = PALETTE.stone, flat = 0.62 } = {}) {
  const rand = seeded(seed);
  // Smooth, water-worn stones: low-frequency lumps rather than per-vertex noise.
  const geo = new THREE.IcosahedronGeometry(size, 3);
  const pos = geo.attributes.position;
  const lumps = Array.from({ length: 3 }, () => ({ dir: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), k: 0.12 + rand() * 0.14 }));
  for (let i = 0; i < pos.count; i += 1) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let f = 1;
    for (const l of lumps) f += Math.max(0, n.dot(l.dir)) ** 2 * l.k;
    v.multiplyScalar(f);
    v.y *= flat;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mesh = inked(geo, color, { thickness: 0.012 });
  mesh.position.y = size * flat * 0.45;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

export function mossMound(size = 0.35, seed = 3) {
  const rand = seeded(seed);
  const g = new THREE.Group();
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i += 1) {
    const r = size * (0.45 + rand() * 0.55);
    const m = plain(new THREE.SphereGeometry(r, 14, 10), i % 2 ? PALETTE.moss : PALETTE.mossLight, { receiveShadow: true });
    m.scale.y = 0.42;
    m.position.set((rand() - 0.5) * size * 1.4, 0, (rand() - 0.5) * size * 1.4);
    g.add(m);
  }
  return g;
}

/** A pond with a soft rim of pebbles, slow ripples, and optional lily pads. */
export function pond(radius = 1, { lilies = 0, seed = 4, deep = false } = {}) {
  const rand = seeded(seed);
  const g = new THREE.Group();
  const bed = plain(new THREE.CircleGeometry(radius, 48), deep ? PALETTE.waterDeep : PALETTE.water, { castShadow: false });
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.02;
  bed.receiveShadow = true;
  g.add(bed);

  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshToonMaterial({ color: PALETTE.water, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.06;
  g.add(surface);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.05, 6, 64), toon(PALETTE.stoneLight));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.05;
  g.add(rim);
  const pebbles = Math.round(radius * 14);
  for (let i = 0; i < pebbles; i += 1) {
    const a = (i / pebbles) * TAU + rand() * 0.2;
    const p = stone(0.06 + rand() * 0.05, { seed: seed * 31 + i, color: rand() > 0.5 ? PALETTE.stone : PALETTE.stoneLight });
    p.position.set(Math.cos(a) * (radius + 0.04), 0, Math.sin(a) * (radius + 0.04));
    g.add(p);
  }

  const pads = [];
  for (let i = 0; i < lilies; i += 1) {
    const a = rand() * TAU;
    const d = radius * (0.3 + rand() * 0.5);
    const pad = plain(new THREE.CircleGeometry(0.13 + rand() * 0.05, 16, 0.3, TAU - 0.5), PALETTE.mossLight, { castShadow: false });
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = rand() * TAU;
    pad.position.set(Math.cos(a) * d, 0.065, Math.sin(a) * d);
    g.add(pad);
    pads.push(pad);
  }

  // Ripples: thin rings that grow and fade. ripple(x, z) adds one on demand (e.g. a splash).
  const rings = [];
  const ringMat = () => new THREE.MeshBasicMaterial({ color: PALETTE.waterFoam, transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 6; i += 1) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), ringMat());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    ring.userData = { age: 1, life: 1 };
    g.add(ring);
    rings.push(ring);
  }
  let next = 0;
  let timer = 0;
  const ripple = (x, z, strength = 1) => {
    const ring = rings[next];
    next = (next + 1) % rings.length;
    ring.position.x = x;
    ring.position.z = z;
    ring.userData = { age: 0, life: 1.8 + strength, max: 0.25 + strength * 0.35 };
  };

  g.userData = {
    kind: 'pond',
    radius,
    ripple,
    update(dt, t, calm) {
      timer -= dt;
      if (!calm && timer <= 0) {
        timer = 1.2 + rand() * 1.8;
        const a = rand() * TAU;
        const d = rand() * radius * 0.7;
        ripple(Math.cos(a) * d, Math.sin(a) * d, 0.3);
      }
      for (const ring of rings) {
        const u = ring.userData;
        if (u.age >= u.life) {
          ring.material.opacity = 0;
          continue;
        }
        u.age += dt;
        const k = u.age / u.life;
        const s = 0.05 + k * u.max;
        ring.scale.set(s, s, s);
        ring.material.opacity = (1 - k) * 0.7;
      }
      for (const [i, pad] of pads.entries()) pad.position.y = 0.065 + Math.sin(t * 0.8 + i) * 0.004;
    },
  };
  return g;
}

/** A koi that circles lazily under the water surface. */
export function koi(pondRadius, { seed = 5, white = false } = {}) {
  const rand = seeded(seed);
  const g = new THREE.Group();
  const body = plain(new THREE.SphereGeometry(0.1, 14, 10), white ? PALETTE.koiWhite : PALETTE.koi, { castShadow: false });
  body.scale.set(1, 0.6, 2.1);
  g.add(body);
  const patch = plain(new THREE.SphereGeometry(0.07, 10, 8), white ? PALETTE.koi : PALETTE.koiWhite, { castShadow: false });
  patch.scale.set(1, 0.5, 1.2);
  patch.position.set(0, 0.03, 0.05);
  g.add(patch);
  const tailGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.09, 0, -0.14),
    new THREE.Vector3(0.09, 0, -0.14),
  ]);
  tailGeo.computeVertexNormals();
  const tail = new THREE.Mesh(tailGeo, toon(white ? PALETTE.koiWhite : PALETTE.koi, { side: THREE.DoubleSide }));
  tail.position.z = -0.19;
  g.add(tail);
  g.position.y = 0.035;

  const orbit = pondRadius * (0.45 + rand() * 0.35);
  const speed = (0.25 + rand() * 0.2) * (rand() > 0.5 ? 1 : -1);
  let angle = rand() * TAU;
  let target = null; // set by feed(): koi gather toward a point
  g.userData = {
    feed(x, z, seconds = 4) {
      target = { x, z, until: seconds };
    },
    update(dt, t) {
      if (target && target.until > 0) {
        target.until -= dt;
        const dx = target.x - g.position.x;
        const dz = target.z - g.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.18) {
          g.position.x += (dx / d) * dt * 0.5;
          g.position.z += (dz / d) * dt * 0.5;
          g.rotation.y = Math.atan2(dx, dz);
        }
      } else {
        angle += speed * dt;
        const x = Math.cos(angle) * orbit;
        const z = Math.sin(angle) * orbit * 0.8;
        g.rotation.y = Math.atan2(x - g.position.x, z - g.position.z) || g.rotation.y;
        g.position.x = x;
        g.position.z = z;
      }
      tail.rotation.y = Math.sin(t * 7 + angle) * 0.45;
    },
  };
  return g;
}

/** A bamboo stalk: segmented, swaying, with leaf sprays near the top. */
export function bamboo(height = 2, { seed = 6, segments } = {}) {
  const rand = seeded(seed);
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  g.add(pivot);
  const n = segments ?? Math.max(2, Math.round(height / 0.42));
  const segH = height / n;
  const radius = 0.045 + height * 0.006;
  for (let i = 0; i < n; i += 1) {
    const seg = inked(new THREE.CylinderGeometry(radius * 0.95, radius, segH * 0.96, 10), PALETTE.bamboo, { thickness: 0.008 });
    seg.position.y = segH * i + segH / 2;
    pivot.add(seg);
    const node = plain(new THREE.TorusGeometry(radius * 1.02, radius * 0.22, 6, 12), PALETTE.bambooNode, { castShadow: false });
    node.rotation.x = Math.PI / 2;
    node.position.y = segH * (i + 1);
    pivot.add(node);
  }
  const leafGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.06, 0.015, 0.16),
    new THREE.Vector3(0, 0, 0.42),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0.42),
    new THREE.Vector3(-0.06, 0.015, 0.16),
  ]);
  leafGeo.computeVertexNormals();
  const leafMat = toon(PALETTE.bambooLeaf, { side: THREE.DoubleSide });
  const sprays = Math.max(1, Math.round(height * 1.4));
  for (let s = 0; s < sprays; s += 1) {
    const y = height * (0.45 + (s / sprays) * 0.55);
    const base = rand() * TAU;
    for (let k = 0; k < 4; k += 1) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.castShadow = true;
      leaf.position.y = y;
      leaf.rotation.y = base + k * 0.5;
      leaf.rotation.x = 0.5 + rand() * 0.4;
      pivot.add(leaf);
    }
  }
  const phase = rand() * TAU;
  g.userData = {
    kind: 'bamboo',
    height,
    radius,
    update(dt, t, calm) {
      const amp = calm ? 0.008 : 0.025;
      pivot.rotation.z = Math.sin(t * 0.7 + phase) * amp;
      pivot.rotation.x = Math.cos(t * 0.5 + phase) * amp * 0.6;
    },
  };
  return g;
}

export function sprout(seed = 7) {
  const rand = seeded(seed);
  const g = new THREE.Group();
  const stem = plain(new THREE.CylinderGeometry(0.012, 0.016, 0.16, 6), PALETTE.bamboo);
  stem.position.y = 0.08;
  g.add(stem);
  for (let i = 0; i < 2; i += 1) {
    const leaf = plain(new THREE.SphereGeometry(0.05, 10, 6), PALETTE.mossLight);
    leaf.scale.set(1.4, 0.25, 0.7);
    leaf.position.set(i ? 0.05 : -0.05, 0.16, 0);
    leaf.rotation.z = i ? -0.5 : 0.5;
    g.add(leaf);
  }
  const phase = rand() * TAU;
  g.userData.update = (dt, t, calm) => {
    g.rotation.z = calm ? 0 : Math.sin(t * 1.3 + phase) * 0.06;
  };
  return g;
}

/** A stone tōrō lantern. Its window glows at night, and one lantern per garden casts real light. */
export function lantern({ night = false, light = false } = {}) {
  const g = new THREE.Group();
  const s = PALETTE.stoneLight;
  const add = (geo, y, color = s) => {
    const m = inked(geo, color, { thickness: 0.01 });
    m.position.y = y;
    g.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 8), 0.04);
  add(new THREE.CylinderGeometry(0.05, 0.06, 0.36, 8), 0.26);
  add(new THREE.CylinderGeometry(0.15, 0.12, 0.06, 6), 0.47);
  const box = add(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 6), 0.58);
  const glowMat = new THREE.MeshBasicMaterial({ color: night ? PALETTE.lantern : 0x6e6a5c });
  const window = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 6), glowMat);
  window.position.y = 0.58;
  window.scale.setScalar(1.02);
  g.add(window);
  add(new THREE.ConeGeometry(0.24, 0.16, 6), 0.74, PALETTE.stone);
  add(new THREE.SphereGeometry(0.04, 8, 6), 0.84, PALETTE.stone);
  box.visible = true;
  let lamp = null;
  if (light) {
    lamp = new THREE.PointLight(PALETTE.lantern, night ? 2.2 : 0, 3.2, 1.6);
    lamp.position.y = 0.6;
    g.add(lamp);
  }
  g.userData = {
    kind: 'lantern',
    update(dt, t) {
      if (lamp && night) lamp.intensity = 2 + Math.sin(t * 3.1) * 0.15 + Math.sin(t * 7.3) * 0.08;
    },
  };
  return g;
}

/** A small Japanese maple whose leaves occasionally drift down. */
export function maple({ seed = 8, size = 1 } = {}) {
  const rand = seeded(seed);
  const g = new THREE.Group();
  const trunk = inked(new THREE.CylinderGeometry(0.05 * size, 0.09 * size, 0.9 * size, 7), PALETTE.woodDark, { thickness: 0.01 });
  trunk.position.y = 0.45 * size;
  trunk.rotation.z = 0.12;
  g.add(trunk);
  const crown = new THREE.Group();
  crown.position.set(0.1 * size, 1.0 * size, 0);
  g.add(crown);
  for (let i = 0; i < 7; i += 1) {
    const blob = inked(
      new THREE.IcosahedronGeometry((0.22 + rand() * 0.14) * size, 0),
      rand() > 0.35 ? PALETTE.maple : PALETTE.mapleDeep,
      { thickness: 0.012 },
    );
    blob.position.set((rand() - 0.5) * 0.7 * size, (rand() - 0.3) * 0.35 * size, (rand() - 0.5) * 0.6 * size);
    crown.add(blob);
  }
  const phase = rand() * TAU;
  g.userData = {
    kind: 'tree',
    crownY: 1.0 * size,
    update(dt, t, calm) {
      crown.rotation.z = calm ? 0 : Math.sin(t * 0.6 + phase) * 0.02;
    },
  };
  return g;
}

/** A falling-water strip from a rock stack into the pond. */
export function waterfall(height = 1.1) {
  const g = new THREE.Group();
  const rocks = [
    [0, 0, 0.5],
    [0.25, 0.35, 0.38],
    [-0.2, 0.55, 0.34],
    [0.05, 0.85, 0.3],
  ];
  rocks.forEach(([x, y, s], i) => {
    const r = stone(s, { seed: 90 + i, color: i % 2 ? PALETTE.stoneDark : PALETTE.stone, flat: 0.8 });
    r.position.set(x, y, -0.15);
    g.add(r);
  });
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex(PALETTE.water);
  ctx.fillRect(0, 0, 32, 128);
  for (let i = 0; i < 26; i += 1) {
    ctx.fillStyle = 'rgba(230,245,248,0.85)';
    ctx.fillRect(Math.random() * 30, Math.random() * 128, 2, 10 + Math.random() * 18);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const fall = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92 }),
  );
  fall.position.set(0.05, height / 2 + 0.05, 0.12);
  g.add(fall);
  g.userData = {
    update(dt, t, calm) {
      if (!calm) tex.offset.y = (tex.offset.y + dt * 0.9) % 1;
    },
  };
  return g;
}

export function bridge(span = 1.4) {
  const g = new THREE.Group();
  const arch = inked(new THREE.TorusGeometry(span / 2, 0.06, 6, 24, Math.PI), PALETTE.wood, { thickness: 0.01 });
  arch.scale.set(1, 0.35, 3.2);
  g.add(arch);
  for (const side of [-1, 1]) {
    const rail = inked(new THREE.TorusGeometry(span / 2, 0.018, 4, 24, Math.PI), PALETTE.woodDark, { thickness: 0.006 });
    rail.scale.set(1, 0.42, 1);
    rail.position.z = side * 0.19;
    rail.position.y = 0.08;
    g.add(rail);
  }
  return g;
}

/** A small open tea pavilion with a hipped roof. */
export function pavilion() {
  const g = new THREE.Group();
  const floor = inked(new THREE.BoxGeometry(1.1, 0.08, 0.9), PALETTE.wood, { thickness: 0.01 });
  floor.position.y = 0.12;
  g.add(floor);
  for (const [x, z] of [[-0.48, -0.38], [0.48, -0.38], [-0.48, 0.38], [0.48, 0.38]]) {
    const post = inked(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), PALETTE.woodDark, { thickness: 0.008 });
    post.position.set(x, 0.55, z);
    g.add(post);
  }
  const roof = inked(new THREE.ConeGeometry(0.95, 0.42, 4), PALETTE.roof, { thickness: 0.012 });
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.15, 1, 0.95);
  roof.position.y = 1.15;
  g.add(roof);
  const cushion = plain(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16), PALETTE.scarf);
  cushion.position.y = 0.19;
  g.add(cushion);
  g.userData = { kind: 'pavilion', seat: new THREE.Vector3(0, 0.2, 0) };
  return g;
}

/** Stylised distant peaks behind the garden, with a band of mist. */
export function peaks(radius, seed = 11) {
  const rand = seeded(seed);
  const g = new THREE.Group();
  const spots = [-0.55, -0.15, 0.25, 0.6];
  spots.forEach((p, i) => {
    const h = 1.2 + rand() * 0.9;
    const m = inked(new THREE.ConeGeometry(0.55 + rand() * 0.25, h, 5), i % 2 ? PALETTE.stoneDark : PALETTE.stone, { thickness: 0.012 });
    const a = Math.PI * (1.25 + p * 0.5);
    m.position.set(Math.cos(a) * (radius - 0.55), h / 2, Math.sin(a) * (radius - 0.55));
    m.rotation.y = rand() * TAU;
    g.add(m);
    const cap = plain(new THREE.ConeGeometry(0.2, 0.3, 5), PALETTE.white);
    cap.position.set(m.position.x, h - 0.12, m.position.z);
    g.add(cap);
  });
  const mist = new THREE.Mesh(
    new THREE.TorusGeometry(radius - 0.7, 0.1, 6, 48, Math.PI * 0.55),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false }),
  );
  mist.rotation.x = Math.PI / 2;
  mist.rotation.z = Math.PI * 1.2;
  mist.position.y = 0.55;
  g.add(mist);
  g.userData.update = (dt, t, calm) => {
    if (!calm) mist.material.opacity = 0.16 + Math.sin(t * 0.4) * 0.06;
  };
  return g;
}

export function eggshell(seed = 12) {
  const rand = seeded(seed);
  const g = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const piece = inked(
      new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * (0.7 + rand() * 0.5), 0, Math.PI / 2),
      PALETTE.white,
      { thickness: 0.006, side: THREE.DoubleSide },
    );
    piece.position.set((rand() - 0.5) * 0.3, 0.02, (rand() - 0.5) * 0.3);
    piece.rotation.set(rand() * 2, rand() * TAU, rand() * 2);
    g.add(piece);
  }
  return g;
}

/** Drifting particles: falling leaves by day, fireflies by night. */
export function drifters(radius, { count = 14, night = false, color = PALETTE.maple, seed = 13 } = {}) {
  const rand = seeded(seed);
  const g = new THREE.Group();
  const items = [];
  const geo = night ? new THREE.SphereGeometry(0.025, 6, 4) : new THREE.PlaneGeometry(0.07, 0.05);
  const mat = night
    ? new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true })
    : toon(color, { side: THREE.DoubleSide });
  for (let i = 0; i < count; i += 1) {
    const m = new THREE.Mesh(geo, night ? mat.clone() : mat);
    m.userData = { a: rand() * TAU, r: rand() * radius * 0.85, y: rand() * 2.4, speed: 0.15 + rand() * 0.25, phase: rand() * TAU };
    items.push(m);
    g.add(m);
  }
  g.userData.update = (dt, t, calm) => {
    g.visible = !calm;
    if (calm) return;
    for (const m of items) {
      const u = m.userData;
      if (night) {
        u.a += dt * 0.15;
        m.position.set(Math.cos(u.a) * u.r, 0.4 + u.y * 0.45 + Math.sin(t * 0.9 + u.phase) * 0.15, Math.sin(u.a) * u.r);
        m.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2 + u.phase));
      } else {
        u.y -= dt * u.speed;
        if (u.y < 0.05) {
          u.y = 2.4;
          u.a = rand() * TAU;
        }
        m.position.set(Math.cos(u.a) * u.r + Math.sin(t + u.phase) * 0.2, u.y, Math.sin(u.a) * u.r);
        m.rotation.set(t * 1.3 + u.phase, t * 0.7, t + u.phase);
      }
    }
  };
  return g;
}
