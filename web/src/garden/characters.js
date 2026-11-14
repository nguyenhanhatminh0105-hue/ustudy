import * as THREE from 'three';
import { PALETTE, bandedToon, inked, outlineMaterial, plain, toonVertex } from './materials.js';
import { spring } from './spring.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

/**
 * Builds a companion rig. The rig is geometry, a few joints, a face that
 * animates itself (blinks, eyelids, chewing) and some loose parts on springs
 * (ears, tail, a head that lags behind the body). behaviour.js decides what
 * the companion does; rig.update() makes it look alive while it does it.
 *
 * rig.root    – placed in the world, origin at the feet
 * rig.pose    – leans into turns, squashes and breathes (owned by behaviour's body animation)
 * rig.body    – the pose of the current activity (sitting, rolling, diving)
 * rig.head    – turns toward the cursor; holds eyes and mouth
 * rig.limbs   – four groups that swing when walking, paddle when swimming
 */
const CHARACTER_SCALE = 1.7;

export function buildCharacter(companion, stage) {
  const rig = companion === 'panda' ? panda(stage) : turtle(stage);
  // Characters are modelled small and scaled up as one, so they read as the
  // star of the diorama without re-tuning every part.
  rig.root.scale.setScalar(CHARACTER_SCALE);
  rig.scale = CHARACTER_SCALE;
  rig.radius *= CHARACTER_SCALE;
  rig.height *= CHARACTER_SCALE;
  rig.legLength *= CHARACTER_SCALE;
  return rig;
}

// ── Shape helpers ─────────────────────────────────────────────────

/** A smooth body of revolution through a few (radius, height) points, listed bottom to top. */
function lathe(points, { segments = 40, samples = 36 } = {}) {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const profile = curve.getSpacedPoints(samples).map((v) => new THREE.Vector2(Math.max(1e-4, v.x), v.y));
  return new THREE.LatheGeometry(profile, segments);
}

/** Paints a geometry per vertex: colourAt(x, y, z) returns a hex colour. */
function paint(geometry, colourAt) {
  const pos = geometry.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    c.set(colourAt(pos.getX(i), pos.getY(i), pos.getZ(i)));
    colours.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}

/** Like inked(), for a vertex-painted body. */
function inkedPainted(geometry, thickness) {
  const mesh = new THREE.Mesh(geometry, toonVertex());
  mesh.castShadow = true;
  const outline = new THREE.Mesh(geometry, outlineMaterial(thickness));
  outline.raycast = () => {};
  mesh.add(outline);
  return mesh;
}

const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(k, 0, 1)).getHex();

function limb(radius, length, color, { flat = 1, rest = { x: 0, y: 0, z: 0 } } = {}) {
  const g = new THREE.Group();
  const m = inked(new THREE.CapsuleGeometry(radius, length, 4, 10), color, { thickness: 0.01 });
  m.position.y = -length / 2;
  // flat < 1 presses the leg into a paddle: a flipper for the turtle.
  m.scale.set(1 / Math.sqrt(flat), 1, flat);
  g.add(m);
  g.rotation.set(rest.x, rest.y, rest.z);
  g.userData.rest = rest;
  return g;
}

// ── Face ──────────────────────────────────────────────────────────

/**
 * Eyes, mouth and cheeks. Each animal passes its own proportions and mouth:
 * the turtle has a wide beak-line smile and nostrils, the panda a little
 * "ω" mouth under its nose and eyes set in tilted patches.
 */
function face(head, { eyeR, spread, eyeY, eyeZ, eyeTall = 1, mouthY, mouthZ, mouthR, mouth = 'smile', blush, patches = false, nostrils = null }) {
  const ink = new THREE.MeshBasicMaterial({ color: PALETTE.ink });
  const eyes = [];
  for (const side of [-1, 1]) {
    const socket = new THREE.Group();
    socket.position.set(side * spread, eyeY, eyeZ);
    socket.rotation.y = side * 0.18;
    head.add(socket);

    if (patches) {
      const patch = plain(new THREE.SphereGeometry(eyeR * 2.1, 16, 12), PALETTE.pandaBlack, { castShadow: false });
      patch.scale.set(0.9, 1.35, 0.45);
      patch.rotation.z = side * -0.55;
      patch.position.set(side * eyeR * 0.15, -eyeR * 0.35, -eyeR * 0.7);
      socket.add(patch);
    }
    // The open eye scales shut vertically, like a lid closing, instead of being swapped out.
    const open = new THREE.Group();
    socket.add(open);
    const white = plain(new THREE.SphereGeometry(eyeR, 16, 12), PALETTE.white, { castShadow: false });
    white.scale.set(1, eyeTall, 0.6);
    open.add(white);
    const pupil = plain(new THREE.SphereGeometry(eyeR * 0.64, 14, 10), PALETTE.ink, { castShadow: false });
    pupil.position.z = eyeR * 0.36;
    pupil.scale.set(1, eyeTall, 0.5);
    open.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(eyeR * 0.2, eyeR * 0.26, eyeR * 0.3);
    pupil.add(glint);

    // ^ happy, — shut (also the bottom of a blink), and @ dizzy.
    const arc = (r, tube, angle) => new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 16, angle), ink);
    const happy = arc(eyeR * 0.62, eyeR * 0.16, Math.PI);
    happy.position.z = eyeR * 0.35;
    socket.add(happy);
    const shut = arc(eyeR * 0.66, eyeR * 0.15, Math.PI);
    shut.rotation.z = Math.PI;
    shut.position.set(0, eyeR * 0.15, eyeR * 0.35);
    socket.add(shut);
    const spiral = arc(eyeR * 0.45, eyeR * 0.12, TAU * 0.85);
    spiral.position.z = eyeR * 0.4;
    socket.add(spiral);
    for (const m of [happy, shut, spiral]) m.visible = false;

    eyes.push({ socket, open, white, pupil, happy, shut, spiral, r: eyeR });
  }

  const smile = new THREE.Group();
  smile.position.set(0, mouthY, mouthZ);
  head.add(smile);
  if (mouth === 'w') {
    for (const side of [-1, 1]) {
      const half = new THREE.Mesh(new THREE.TorusGeometry(mouthR, mouthR * 0.24, 6, 12, Math.PI), ink);
      half.rotation.z = Math.PI;
      half.position.x = side * mouthR;
      smile.add(half);
    }
  } else {
    // A wide, shallow arc: reads as a beak line rather than a sticker smile.
    const line = new THREE.Mesh(new THREE.TorusGeometry(mouthR, mouthR * 0.13, 6, 18, Math.PI * 0.6), ink);
    line.rotation.z = Math.PI + Math.PI * 0.2;
    smile.add(line);
  }
  const open = plain(new THREE.SphereGeometry(mouthR * 0.9, 12, 10), 0x7a2f2a, { castShadow: false });
  open.scale.set(1, 0.85, 0.4);
  open.position.set(0, mouthY - mouthR * 0.35, mouthZ - mouthR * 0.1);
  open.visible = false;
  head.add(open);

  if (nostrils) {
    for (const side of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(nostrils.r, 8, 6), ink);
      n.position.set(side * nostrils.spread, nostrils.y, nostrils.z);
      head.add(n);
    }
  }

  const cheeks = [];
  if (blush) {
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(
        new THREE.CircleGeometry(eyeR * 0.75, 16),
        new THREE.MeshBasicMaterial({ color: PALETTE.blush, transparent: true, opacity: 0.6 }),
      );
      c.position.set(side * spread * 1.45, eyeY - eyeR * 1.3, eyeZ - eyeR * 0.3);
      c.rotation.y = side * 0.55;
      head.add(c);
      cheeks.push(c);
    }
  }
  return { eyes, mouth: { smile, open, r: mouthR }, cheeks };
}

const EYES_FOR = { happy: 'happy', love: 'happy', sleep: 'shut', calm: 'shut', dizzy: 'spiral' };
const MOUTH_OPEN = new Set(['surprised', 'eat', 'love']);

/** Runs the face: eased lids, natural blinks (sometimes a double), a mouth that opens and closes smoothly. */
function faceAnimator(parts) {
  let expression = 'neutral';
  let lids = 1;
  let mouth = 0;
  let blinkLeft = 0;
  let nextBlink = 1.5 + Math.random() * 3;
  let blush = 0.6;

  return {
    get expression() {
      return expression;
    },
    set(name) {
      // 'blink' is kept for older callers; blinking is automatic now.
      expression = name === 'blink' ? 'neutral' : name;
    },
    update(dt) {
      const mode = EYES_FOR[expression] ?? 'open';
      nextBlink -= dt;
      if (nextBlink <= 0) {
        blinkLeft = 0.13;
        nextBlink = Math.random() < 0.2 ? 0.28 : 2.2 + Math.random() * 4;
      }
      blinkLeft = Math.max(0, blinkLeft - dt);
      const want = mode === 'open' && blinkLeft === 0 ? (expression === 'surprised' ? 1.2 : 1) : 0;
      // Lids drop fast and lift a little slower, like real ones.
      lids += (want - lids) * Math.min(1, dt * (want < lids ? 34 : 16));

      const wide = Math.max(1, lids);
      const closedness = clamp(1 - lids * 4, 0, 1);
      for (const e of parts.eyes) {
        e.open.visible = lids > 0.04;
        e.open.scale.set(wide, Math.max(0.001, lids), wide);
        e.happy.visible = mode === 'happy' && closedness > 0;
        e.shut.visible = (mode === 'shut' || mode === 'open') && closedness > 0;
        e.spiral.visible = mode === 'spiral' && closedness > 0;
        for (const g of [e.happy, e.shut]) g.scale.set(1, Math.max(0.001, closedness), 1);
        e.spiral.rotation.z += dt * 7;
      }

      mouth += ((MOUTH_OPEN.has(expression) ? 1 : 0) - mouth) * Math.min(1, dt * 18);
      parts.mouth.open.visible = mouth > 0.06;
      parts.mouth.open.scale.set(0.6 + mouth * 0.4, 0.85 * mouth, 0.4);
      parts.mouth.smile.visible = mouth < 0.45 && expression !== 'dizzy';

      blush += ((expression === 'love' || expression === 'happy' ? 0.95 : 0.6) - blush) * Math.min(1, dt * 4);
      for (const c of parts.cheeks) c.material.opacity = blush;
    },
  };
}

// ── Turtle ────────────────────────────────────────────────────────

const TURTLE = {
  1: { shell: 0.2, head: 0.17, eye: 0.058, leg: 0.045 },
  2: { shell: 0.27, head: 0.18, eye: 0.056, leg: 0.055 },
  3: { shell: 0.34, head: 0.185, eye: 0.052, leg: 0.065 },
  4: { shell: 0.42, head: 0.19, eye: 0.05, leg: 0.075 },
};

function turtle(stage) {
  const p = TURTLE[stage] ?? TURTLE[1];
  const s = p.shell;
  const root = new THREE.Group();
  const pose = new THREE.Group();
  root.add(pose);
  const body = new THREE.Group();
  pose.add(body);
  const lift = p.leg * 1.6;
  body.position.y = lift;

  // Shell: one smooth dome that flares into a lip, darker toward the rim, with raised scutes.
  const shell = new THREE.Group();
  shell.scale.z = 1.1;
  body.add(shell);
  const domeGeo = lathe(
    [[0, -0.03], [0.88, -0.01], [1.04, 0.05], [1.0, 0.16], [0.84, 0.4], [0.62, 0.62], [0.34, 0.76], [0, 0.8]].map(([x, y]) => [x * s, y * s]),
    { segments: 44, samples: 40 },
  );
  paint(domeGeo, (x, y) => mix(PALETTE.shellRim, PALETTE.shell, (y / s - 0.06) / 0.14));
  shell.add(inkedPainted(domeGeo, 0.014));

  const scuteRows = [[0, 1, 0.3], [0.85, 6, 0.25]];
  if (stage >= 3) scuteRows.push([1.28, 9, 0.18]);
  const a = s * 0.97;
  const b = s * 0.8;
  for (const [theta, count, size] of scuteRows) {
    for (let i = 0; i < count; i += 1) {
      const phi = (i / count) * TAU + (count === 9 ? 0.35 : 0);
      const at = new THREE.Vector3(a * Math.sin(theta) * Math.cos(phi), b * Math.cos(theta), a * Math.sin(theta) * Math.sin(phi));
      const normal = new THREE.Vector3(at.x / (a * a), at.y / (b * b), at.z / (a * a)).normalize();
      const scute = plain(new THREE.SphereGeometry(s * size, 6, 3), PALETTE.shellPlate, { castShadow: false });
      scute.scale.set(1, 0.3, 1);
      scute.position.copy(at.multiplyScalar(0.985));
      scute.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      scute.rotateY(-phi);
      shell.add(scute);
    }
  }
  const belly = plain(new THREE.SphereGeometry(s * 0.95, 20, 12), PALETTE.plastron);
  belly.scale.set(1, 0.26, 1.02);
  belly.position.y = -s * 0.01;
  shell.add(belly);

  // A real neck, rising forward out of the shell; it slides back in when the turtle hides.
  const neck = new THREE.Group();
  neck.position.set(0, s * 0.26, s * 0.82);
  body.add(neck);
  const rise = 0.62;
  const neckLen = p.head * 1.15;
  const along = new THREE.Vector3(0, Math.sin(rise), Math.cos(rise));
  const neckMesh = inked(new THREE.CapsuleGeometry(p.head * 0.44, neckLen, 4, 12), PALETTE.turtleSkin, { thickness: 0.009 });
  neckMesh.rotation.x = Math.PI / 2 - rise;
  neckMesh.position.copy(along).multiplyScalar(neckLen / 2);
  neck.add(neckMesh);
  const head = new THREE.Group();
  head.position.copy(along).multiplyScalar(neckLen * 0.95).add(new THREE.Vector3(0, p.head * 0.2, p.head * 0.1));
  neck.add(head);
  const skull = inked(new THREE.SphereGeometry(p.head, 26, 18), PALETTE.turtleSkin, { thickness: 0.012 });
  skull.scale.set(1, 0.9, 1.1);
  head.add(skull);
  const parts = face(head, {
    eyeR: p.eye * 1.05,
    eyeTall: 1.12,
    spread: p.head * 0.47,
    eyeY: p.head * 0.16,
    eyeZ: p.head * 0.84,
    mouthY: -p.head * 0.3,
    mouthZ: p.head * 1.02,
    mouthR: p.head * 0.42,
    mouth: 'smile',
    blush: stage <= 3,
    nostrils: { r: p.head * 0.035, spread: p.head * 0.12, y: p.head * 0.0, z: p.head * 1.08 },
  });

  // Flipper legs: pressed flat, the front pair larger, as on a real turtle.
  const limbs = {};
  for (const [key, x, z] of [['fl', -1, 1], ['fr', 1, 1], ['bl', -1, -1], ['br', 1, -1]]) {
    const front = z > 0;
    const r = p.leg * (front ? 1.12 : 0.95);
    const len = p.leg * (front ? 1.45 : 1.15);
    const leg = limb(r, len, PALETTE.turtleSkin, { flat: 0.62 });
    leg.position.set(x * s * 0.62, p.leg * 0.4, z * s * 0.6);
    body.add(leg);
    limbs[key] = leg;
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0, -s * 1.05);
  body.add(tail);
  const tailMesh = inked(new THREE.ConeGeometry(p.leg * 0.6, p.leg * 1.6, 8), PALETTE.turtleSkin, { thickness: 0.006 });
  tailMesh.rotation.x = -Math.PI / 2.3;
  tailMesh.position.z = -p.leg * 0.5;
  tail.add(tailMesh);

  // Stage accessories.
  if (stage === 1) {
    const cap = inked(new THREE.SphereGeometry(p.head * 0.82, 18, 10, 0, TAU, 0, Math.PI / 2.4), PALETTE.white, { thickness: 0.008, side: THREE.DoubleSide });
    cap.position.y = p.head * 0.42;
    cap.rotation.z = 0.25;
    head.add(cap);
  } else if (stage === 2) {
    head.add(leafTuft(p.head * 0.92));
  } else if (stage === 3) {
    const scarf = inked(new THREE.TorusGeometry(p.head * 0.52, p.head * 0.15, 8, 20), PALETTE.scarf, { thickness: 0.008 });
    scarf.rotation.x = -rise;
    scarf.position.copy(along).multiplyScalar(neckLen * 0.28);
    neck.add(scarf);
    const end = inked(new THREE.BoxGeometry(p.head * 0.22, p.head * 0.6, p.head * 0.08), PALETTE.scarf, { thickness: 0.006 });
    end.position.copy(scarf.position).add(new THREE.Vector3(p.head * 0.42, -p.head * 0.32, -p.head * 0.1));
    end.rotation.z = 0.4;
    neck.add(end);
  } else {
    // A tiny bonsai riding on the shell: the adult turtle carries its own garden.
    const bonsai = new THREE.Group();
    bonsai.position.set(-s * 0.1, s * 0.76, -s * 0.1);
    const trunk = inked(new THREE.CylinderGeometry(0.018, 0.03, 0.16, 6), PALETTE.woodDark, { thickness: 0.006 });
    trunk.position.y = 0.08;
    trunk.rotation.z = 0.35;
    bonsai.add(trunk);
    for (const [x, y, z, r] of [[0.05, 0.17, 0, 0.07], [-0.04, 0.2, 0.03, 0.06], [0.0, 0.24, -0.03, 0.055]]) {
      const puff = inked(new THREE.IcosahedronGeometry(r, 1), PALETTE.moss, { thickness: 0.006 });
      puff.position.set(x, y, z);
      bonsai.add(puff);
    }
    body.add(bonsai);
  }

  const rig = baseRig({ root, pose, body, head, parts, limbs, tail, companion: 'turtle', stage });
  rig.neck = neck;
  rig.height = lift + s * 0.8 + p.head * 1.6;
  rig.headHome = neck.position.clone();
  rig.radius = s * 1.15;
  rig.lift = lift;
  rig.legLength = p.leg * 1.45 + p.leg;
  /** Height of the waterline above the feet when floating: the shell rides half out of the water. */
  rig.floatY = lift + s * 0.22;
  /** Height of the top of the shell above the feet. */
  rig.topY = lift + s * 0.8;
  /** Where the body turns around when it rolls or flips (in body space). */
  rig.centerY = s * 0.3;
  /** 0 = head out, 1 = fully tucked into the shell. */
  rig.tuck = (k) => {
    neck.position.z = rig.headHome.z - k * s * 0.8;
    neck.position.y = rig.headHome.y - k * s * 0.12;
    for (const l of Object.values(limbs)) l.scale.setScalar(1 - k * 0.8);
    tail.scale.setScalar(1 - k * 0.8);
  };
  return rig;
}

// ── Panda ─────────────────────────────────────────────────────────

const PANDA = {
  1: { body: 0.2, head: 0.2, eye: 0.034, limb: 0.06 },
  2: { body: 0.26, head: 0.215, eye: 0.034, limb: 0.07 },
  3: { body: 0.32, head: 0.235, eye: 0.034, limb: 0.085 },
  4: { body: 0.38, head: 0.255, eye: 0.035, limb: 0.1 },
};

function panda(stage) {
  const p = PANDA[stage] ?? PANDA[1];
  const b = p.body;
  const root = new THREE.Group();
  const pose = new THREE.Group();
  root.add(pose);
  const body = new THREE.Group();
  pose.add(body);
  const legLen = p.limb * 1.2;
  body.position.y = legLen + p.limb * 0.6;

  // One pear-shaped torso with the black shoulder band painted on: it slopes from the
  // chest, where the arms come out, up over the shoulders to the back.
  const torsoGeo = lathe(
    [[0, 0], [0.62, 0.04], [0.92, 0.3], [1.0, 0.72], [0.93, 1.12], [0.72, 1.48], [0.42, 1.72], [0, 1.8]].map(([x, y]) => [x * b, y * b]),
    { segments: 56, samples: 48 },
  );
  const torso = new THREE.Mesh(torsoGeo, bandedToon({ color: PALETTE.pandaWhite, band: PALETTE.pandaBlack, lo: 1.18 * b, hi: 1.58 * b, tilt: 0.38 }));
  torso.castShadow = true;
  const torsoOutline = new THREE.Mesh(torsoGeo, outlineMaterial(0.014));
  torsoOutline.raycast = () => {};
  torso.add(torsoOutline);
  torso.scale.set(1, 1, 0.94);
  body.add(torso);

  const head = new THREE.Group();
  head.position.set(0, b * 1.8 + p.head * 0.6, b * 0.05);
  body.add(head);
  const skull = inked(new THREE.SphereGeometry(p.head, 28, 20), PALETTE.pandaWhite, { thickness: 0.014 });
  skull.scale.set(1.08, 0.95, 0.98);
  head.add(skull);
  // Ears sit on pivots so they can flop when the head moves.
  const ears = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * p.head * 0.66, p.head * 0.62, -p.head * 0.12);
    pivot.rotation.z = side * -0.35;
    head.add(pivot);
    const ear = inked(new THREE.SphereGeometry(p.head * 0.32, 14, 10), PALETTE.pandaBlack, { thickness: 0.01 });
    ear.scale.z = 0.6;
    ear.position.y = p.head * 0.12;
    pivot.add(ear);
    pivot.userData.side = side;
    ears.push(pivot);
  }
  const muzzle = plain(new THREE.SphereGeometry(p.head * 0.36, 16, 12), PALETTE.white, { castShadow: false });
  muzzle.scale.set(1.2, 0.8, 0.7);
  muzzle.position.set(0, -p.head * 0.28, p.head * 0.78);
  head.add(muzzle);
  const nose = plain(new THREE.SphereGeometry(p.head * 0.1, 12, 8), PALETTE.ink, { castShadow: false });
  nose.scale.set(1.35, 0.8, 0.8);
  nose.position.set(0, -p.head * 0.15, p.head * 1.0);
  head.add(nose);
  const philtrum = new THREE.Mesh(new THREE.CylinderGeometry(p.head * 0.012, p.head * 0.012, p.head * 0.1, 6), new THREE.MeshBasicMaterial({ color: PALETTE.ink }));
  philtrum.position.set(0, -p.head * 0.25, p.head * 1.035);
  head.add(philtrum);
  const parts = face(head, {
    eyeR: p.eye,
    spread: p.head * 0.36,
    eyeY: p.head * 0.08,
    eyeZ: p.head * 0.9,
    mouthY: -p.head * 0.31,
    mouthZ: p.head * 1.03,
    mouthR: p.head * 0.08,
    mouth: 'w',
    blush: true,
    patches: true,
  });

  const limbs = {};
  for (const [key, x, y, z, len, rot] of [
    ['fl', -1, b * 1.22, b * 0.38, p.limb * 2.0, 0.5],
    ['fr', 1, b * 1.22, b * 0.38, p.limb * 2.0, 0.5],
    ['bl', -1, p.limb * 0.4, b * 0.1, legLen, 0],
    ['br', 1, p.limb * 0.4, b * 0.1, legLen, 0],
  ]) {
    const front = key.startsWith('f');
    const l = limb(p.limb, len, PALETTE.pandaBlack, { rest: { x: -rot, y: 0, z: x * (front ? 0.35 : 0) } });
    l.position.set(x * b * (front ? 0.82 : 0.5), y, z);
    body.add(l);
    limbs[key] = l;
  }
  const tail = new THREE.Group();
  tail.position.set(0, b * 0.45, -b * 0.88);
  body.add(tail);
  tail.add(plain(new THREE.SphereGeometry(p.limb * 0.7, 10, 8), PALETTE.pandaWhite));

  // A bamboo stick the panda holds, used for eating; its size follows the stage.
  const snack = new THREE.Group();
  const stickLen = b * 1.4;
  const stick = inked(new THREE.CylinderGeometry(p.limb * 0.28, p.limb * 0.28, stickLen, 8), PALETTE.bamboo, { thickness: 0.006 });
  snack.add(stick);
  const leaf = plain(new THREE.SphereGeometry(p.limb * 0.6, 8, 6), PALETTE.bambooLeaf);
  leaf.scale.set(0.5, 1.6, 0.2);
  leaf.position.set(p.limb * 0.3, stickLen * 0.45, 0);
  snack.add(leaf);
  snack.position.set(0, -p.limb * 2.0, 0.05);
  snack.rotation.x = 1.1;
  limbs.fr.add(snack);
  snack.visible = stage === 2;

  if (stage === 1) {
    head.add(leafTuft(p.head * 0.92));
  } else if (stage === 3) {
    const band = inked(new THREE.TorusGeometry(p.head * 1.07, p.head * 0.075, 8, 28, Math.PI), PALETTE.headphones, { thickness: 0.006 });
    band.position.y = p.head * 0.02;
    head.add(band);
    for (const side of [-1, 1]) {
      const cup = inked(new THREE.CylinderGeometry(p.head * 0.27, p.head * 0.27, p.head * 0.18, 18), PALETTE.headphones, { thickness: 0.008 });
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * p.head * 1.05, -p.head * 0.05, 0);
      head.add(cup);
    }
  } else if (stage === 4) {
    const hat = new THREE.Group();
    hat.position.y = p.head * 0.78;
    const brim = inked(new THREE.ConeGeometry(p.head * 1.55, p.head * 0.55, 24, 1, true), PALETTE.straw, { thickness: 0.01, side: THREE.DoubleSide });
    hat.add(brim);
    const knot = plain(new THREE.SphereGeometry(p.head * 0.1, 8, 6), PALETTE.strawDeep);
    knot.position.y = p.head * 0.26;
    hat.add(knot);
    hat.rotation.z = 0.12;
    head.add(hat);
    // Prayer beads around one wrist.
    const beads = new THREE.Group();
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * TAU;
      const bead = plain(new THREE.SphereGeometry(p.limb * 0.2, 8, 6), PALETTE.woodDark, { castShadow: false });
      bead.position.set(Math.cos(a) * p.limb * 1.05, 0, Math.sin(a) * p.limb * 1.05);
      beads.add(bead);
    }
    beads.position.y = -p.limb * 1.6;
    limbs.fl.add(beads);
  }

  const rig = baseRig({ root, pose, body, head, parts, limbs, tail, ears, companion: 'panda', stage });
  rig.snack = snack;
  rig.height = body.position.y + b * 1.8 + p.head * 1.6;
  rig.radius = b * 1.1;
  rig.lift = body.position.y;
  rig.legLength = legLen + p.limb;
  rig.floatY = body.position.y + b * 1.2;
  rig.topY = rig.height;
  rig.centerY = b * 0.9;
  rig.tuck = () => {};
  return rig;
}

function leafTuft(top) {
  const g = new THREE.Group();
  g.position.y = top;
  const stem = plain(new THREE.CylinderGeometry(0.008, 0.01, top * 0.38, 6), PALETTE.bamboo);
  stem.position.y = top * 0.16;
  g.add(stem);
  for (const side of [-1, 1]) {
    const leaf = inked(new THREE.SphereGeometry(top * 0.24, 10, 6), PALETTE.mossLight, { thickness: 0.006 });
    leaf.scale.set(1.4, 0.3, 0.7);
    leaf.position.set(side * top * 0.2, top * 0.35, 0);
    leaf.rotation.z = side * -0.5;
    g.add(leaf);
  }
  // The tuft sways on its own little spring (see baseRig).
  g.userData.sway = true;
  return g;
}

function baseRig({ root, pose, body, head, parts, limbs, tail = null, ears = [], companion, stage }) {
  const faceAnim = faceAnimator(parts);
  const tmp = new THREE.Vector3();
  const look = { yaw: 0, pitch: 0, px: 0, py: 0 };
  const headHome = head.position.clone();
  const tuft = head.children.find((c) => c.userData.sway) ?? null;

  // Loose parts. Each is pushed by how the head and body move, then settles.
  const lag = spring({ stiffness: 160, damping: 13 });
  const earTilt = spring({ stiffness: 70, damping: 6 });
  const earSpread = spring({ stiffness: 70, damping: 6 });
  const wag = spring({ stiffness: 50, damping: 4 });
  const sway = spring({ stiffness: 40, damping: 4 });
  const droop = spring({ stiffness: 20, damping: 9 });
  const last = { y: null, yaw: null };
  const world = new THREE.Vector3();

  const rig = {
    companion,
    stage,
    root,
    pose,
    body,
    head,
    limbs,
    tail,
    ears,
    parts,
    setExpression: (name) => faceAnim.set(name),
    get expression() {
      return faceAnim.expression;
    },
    /** How far the head hangs (radians); behaviour raises it for naps and sad moments. */
    set droop(v) {
      droop.target = v;
    },
    /**
     * Turns head and pupils toward a world-space point (or relaxes when null).
     * Smoothed, so fast cursor moves still read as a living glance.
     */
    lookAt(target, dt, strength = 1) {
      let yaw = 0;
      let pitch = 0;
      let px = 0;
      let py = 0;
      if (target) {
        head.updateWorldMatrix(true, false);
        tmp.copy(target);
        head.parent.worldToLocal(tmp);
        tmp.sub(head.position);
        const flat = Math.hypot(tmp.x, tmp.z) || 1e-3;
        yaw = clamp(Math.atan2(tmp.x, tmp.z), -1.0, 1.0) * 0.65 * strength;
        pitch = clamp(-Math.atan2(tmp.y, flat), -0.5, 0.45) * 0.6 * strength;
        const dir = tmp.normalize();
        px = clamp(dir.x, -1, 1);
        py = clamp(dir.y + 0.15, -1, 1);
      }
      // The eyes get there first and the head follows, the way a glance works.
      const k = 1 - Math.exp(-dt * 7);
      look.yaw += (yaw - look.yaw) * k;
      look.pitch += (pitch - look.pitch) * k;
      const ke = 1 - Math.exp(-dt * 22);
      look.px += (px - look.px) * ke;
      look.py += (py - look.py) * ke;
      head.rotation.y = look.yaw;
      head.rotation.x = look.pitch + droop.value;
      for (const e of parts.eyes) {
        e.pupil.position.x = look.px * e.r * 0.34;
        e.pupil.position.y = look.py * e.r * 0.3;
      }
    },
    /** Secondary motion and the face; call once per frame after the body has been posed. */
    update(dt, t) {
      if (dt <= 0) return;
      faceAnim.update(dt);
      droop.update(dt);
      head.getWorldPosition(world);
      const vy = last.y === null ? 0 : (world.y - last.y) / dt;
      const yaw = root.rotation.y + head.rotation.y;
      const vyaw = last.yaw === null ? 0 : Math.atan2(Math.sin(yaw - last.yaw), Math.cos(yaw - last.yaw)) / dt;
      last.y = world.y;
      last.yaw = yaw;

      // The head trails a moment behind the body when it bobs.
      lag.target = clamp(-vy * 0.012, -0.012, 0.012);
      head.position.y = headHome.y + lag.update(dt);

      earTilt.target = clamp(vy * 0.5, -0.45, 0.45);
      earSpread.target = clamp(-vyaw * 0.08, -0.35, 0.35);
      earTilt.update(dt);
      earSpread.update(dt);
      for (const ear of ears) {
        ear.rotation.x = -earTilt.value;
        ear.rotation.y = earSpread.value;
      }

      wag.target = clamp(-vyaw * 0.15, -0.5, 0.5) + Math.sin(t * 1.7) * 0.06;
      wag.update(dt);
      if (tail) tail.rotation.y = wag.value;

      sway.target = clamp(-vyaw * 0.1 + vy * 0.3, -0.5, 0.5);
      sway.update(dt);
      if (tuft) tuft.rotation.z = sway.value;
    },
  };
  rig.setExpression('neutral');
  return rig;
}
