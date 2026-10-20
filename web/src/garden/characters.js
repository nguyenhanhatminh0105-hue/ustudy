import * as THREE from 'three';
import { PALETTE, inked, plain, toon } from './materials.js';

const TAU = Math.PI * 2;

/**
 * Builds a companion rig. The rig is only geometry plus a few joints and an
 * expression switch; behaviour.js decides what it does.
 *
 * rig.root    – placed in the world, origin at the feet
 * rig.body    – bobs, squashes and tilts
 * rig.head    – turns toward the cursor; holds eyes and mouth
 * rig.limbs   – four groups that swing when walking or paddling
 */
const CHARACTER_SCALE = 1.7;

export function buildCharacter(companion, stage) {
  const rig = companion === 'panda' ? panda(stage) : turtle(stage);
  // Characters are modelled small and scaled up as one, so they read as the
  // star of the diorama without re-tuning every part.
  rig.root.scale.setScalar(CHARACTER_SCALE);
  rig.radius *= CHARACTER_SCALE;
  rig.height *= CHARACTER_SCALE;
  return rig;
}

// ── Shared face parts ─────────────────────────────────────────────

function face(head, { eyeR, spread, eyeY, eyeZ, mouthY, mouthZ, blush, patches = null }) {
  const eyes = [];
  for (const side of [-1, 1]) {
    const socket = new THREE.Group();
    socket.position.set(side * spread, eyeY, eyeZ);
    head.add(socket);

    if (patches) {
      const patch = plain(new THREE.SphereGeometry(eyeR * 1.9, 16, 12), PALETTE.pandaBlack, { castShadow: false });
      patch.scale.set(1, 1.25, 0.5);
      patch.rotation.z = side * -0.5;
      patch.position.z = -eyeR * 0.6;
      socket.add(patch);
    }
    const open = new THREE.Group();
    socket.add(open);
    const white = plain(new THREE.SphereGeometry(eyeR, 16, 12), PALETTE.white, { castShadow: false });
    white.scale.z = 0.6;
    open.add(white);
    const pupil = plain(new THREE.SphereGeometry(eyeR * 0.62, 14, 10), PALETTE.ink, { castShadow: false });
    pupil.position.z = eyeR * 0.36;
    pupil.scale.z = 0.5;
    open.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(eyeR * 0.2, eyeR * 0.24, eyeR * 0.3);
    pupil.add(glint);

    // ^ shaped closed-happy eye, and a flat closed-sleepy eye.
    const happy = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 0.62, eyeR * 0.16, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: PALETTE.ink }));
    happy.position.z = eyeR * 0.35;
    happy.visible = false;
    socket.add(happy);
    const shut = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 0.62, eyeR * 0.14, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: PALETTE.ink }));
    shut.rotation.z = Math.PI;
    shut.position.set(0, eyeR * 0.2, eyeR * 0.35);
    shut.visible = false;
    socket.add(shut);
    const spiral = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 0.45, eyeR * 0.12, 6, 18, TAU * 0.85), new THREE.MeshBasicMaterial({ color: PALETTE.ink }));
    spiral.position.z = eyeR * 0.4;
    spiral.visible = false;
    socket.add(spiral);

    eyes.push({ socket, open, white, pupil, happy, shut, spiral, r: eyeR });
  }

  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(eyeR * 0.55, eyeR * 0.12, 6, 14, Math.PI),
    new THREE.MeshBasicMaterial({ color: PALETTE.ink }),
  );
  smile.rotation.z = Math.PI;
  smile.position.set(0, mouthY, mouthZ);
  head.add(smile);
  const open = plain(new THREE.SphereGeometry(eyeR * 0.55, 12, 10), 0x7a2f2a, { castShadow: false });
  open.scale.set(1, 0.8, 0.4);
  open.position.set(0, mouthY - eyeR * 0.15, mouthZ - eyeR * 0.05);
  open.visible = false;
  head.add(open);

  const cheeks = [];
  if (blush) {
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(
        new THREE.CircleGeometry(eyeR * 0.75, 16),
        new THREE.MeshBasicMaterial({ color: PALETTE.blush, transparent: true, opacity: 0.7 }),
      );
      c.position.set(side * spread * 1.45, eyeY - eyeR * 1.25, eyeZ - eyeR * 0.15);
      c.rotation.y = side * 0.5;
      head.add(c);
      cheeks.push(c);
    }
  }
  return { eyes, mouth: { smile, open }, cheeks };
}

function makeExpressionSetter(parts) {
  let current = 'neutral';
  return (name) => {
    if (name === current) return;
    current = name;
    for (const e of parts.eyes) {
      e.open.visible = ['neutral', 'surprised', 'eat', 'calm-open'].includes(name);
      e.happy.visible = name === 'happy' || name === 'love';
      e.shut.visible = name === 'sleep' || name === 'calm' || name === 'blink';
      e.spiral.visible = name === 'dizzy';
      const s = name === 'surprised' ? 1.18 : 1;
      e.open.scale.set(s, s, s);
    }
    parts.mouth.open.visible = ['surprised', 'eat', 'love'].includes(name);
    parts.mouth.smile.visible = !parts.mouth.open.visible && name !== 'dizzy';
    for (const c of parts.cheeks) c.material.opacity = name === 'love' || name === 'happy' ? 0.95 : 0.6;
  };
}

function limb(radius, length, color) {
  const g = new THREE.Group();
  const m = inked(new THREE.CapsuleGeometry(radius, length, 4, 10), color, { thickness: 0.01 });
  m.position.y = -length / 2;
  g.add(m);
  return g;
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
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const lift = p.leg * 1.6;
  body.position.y = lift;

  // Shell: a dome with raised plates and a dark rim, over a pale plastron.
  const shell = new THREE.Group();
  body.add(shell);
  const dome = inked(new THREE.SphereGeometry(p.shell, 28, 18, 0, TAU, 0, Math.PI / 2), PALETTE.shell, { thickness: 0.014 });
  dome.scale.set(1, 0.78, 1.1);
  shell.add(dome);
  const plateMat = toon(PALETTE.shellPlate);
  const plates = [[0, 1.0], ...Array.from({ length: 6 }, (_, i) => [(i / 6) * TAU, 0.55])];
  for (const [a, h] of plates) {
    const plate = new THREE.Mesh(new THREE.CircleGeometry(p.shell * 0.26, 6), plateMat);
    const phi = h === 1.0 ? 0 : 0.95;
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(a), Math.cos(phi), Math.sin(phi) * Math.sin(a));
    plate.position.set(dir.x * p.shell * 1.005, dir.y * p.shell * 0.78 * 1.005, dir.z * p.shell * 1.1 * 1.005);
    plate.lookAt(plate.position.clone().multiplyScalar(2));
    shell.add(plate);
  }
  const rim = inked(new THREE.TorusGeometry(p.shell, p.shell * 0.09, 8, 36), PALETTE.shellRim, { thickness: 0.008 });
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, 1.1, 1);
  shell.add(rim);
  const belly = plain(new THREE.SphereGeometry(p.shell * 0.95, 20, 12), PALETTE.plastron);
  belly.scale.set(1, 0.28, 1.05);
  shell.add(belly);

  // Neck and head (the neck slides into the shell when it hides).
  const neck = new THREE.Group();
  neck.position.set(0, p.shell * 0.22, p.shell * 0.95);
  body.add(neck);
  const neckMesh = inked(new THREE.CylinderGeometry(p.head * 0.42, p.head * 0.5, p.head * 0.9, 12), PALETTE.turtleSkinDeep, { thickness: 0.008 });
  neckMesh.rotation.x = Math.PI / 2.6;
  neckMesh.position.set(0, p.head * 0.25, p.head * 0.15);
  neck.add(neckMesh);
  const head = new THREE.Group();
  head.position.set(0, p.head * 0.75, p.head * 0.6);
  neck.add(head);
  const skull = inked(new THREE.SphereGeometry(p.head, 24, 18), PALETTE.turtleSkin, { thickness: 0.012 });
  skull.scale.set(1, 0.92, 1.02);
  head.add(skull);
  const parts = face(head, {
    eyeR: p.eye,
    spread: p.head * 0.42,
    eyeY: p.head * 0.12,
    eyeZ: p.head * 0.82,
    mouthY: -p.head * 0.28,
    mouthZ: p.head * 0.93,
    blush: stage <= 3,
  });

  const limbs = {};
  const legLen = p.leg * 1.3;
  for (const [key, x, z] of [['fl', -1, 1], ['fr', 1, 1], ['bl', -1, -1], ['br', 1, -1]]) {
    const leg = limb(p.leg, legLen, PALETTE.turtleSkin);
    leg.position.set(x * p.shell * 0.62, p.leg * 0.4, z * p.shell * 0.62);
    body.add(leg);
    limbs[key] = leg;
  }
  const tail = inked(new THREE.ConeGeometry(p.leg * 0.6, p.leg * 1.6, 8), PALETTE.turtleSkin, { thickness: 0.006 });
  tail.rotation.x = -Math.PI / 2.3;
  tail.position.set(0, 0, -p.shell * 1.12);
  body.add(tail);

  // Stage accessories.
  if (stage === 1) {
    const cap = inked(new THREE.SphereGeometry(p.head * 0.82, 18, 10, 0, TAU, 0, Math.PI / 2.4), PALETTE.white, { thickness: 0.008, side: THREE.DoubleSide });
    cap.position.y = p.head * 0.48;
    cap.rotation.z = 0.25;
    head.add(cap);
  } else if (stage === 2) {
    head.add(leafTuft(p.head));
  } else if (stage === 3) {
    const scarf = inked(new THREE.TorusGeometry(p.head * 0.62, p.head * 0.16, 8, 20), PALETTE.scarf, { thickness: 0.008 });
    scarf.rotation.x = Math.PI / 2.4;
    scarf.position.set(0, p.head * 0.05, p.head * 0.05);
    neck.add(scarf);
    const end = inked(new THREE.BoxGeometry(p.head * 0.22, p.head * 0.6, p.head * 0.08), PALETTE.scarf, { thickness: 0.006 });
    end.position.set(p.head * 0.45, -p.head * 0.2, -p.head * 0.2);
    end.rotation.z = 0.4;
    neck.add(end);
  } else {
    // A tiny bonsai riding on the shell: the adult turtle carries its own garden.
    const bonsai = new THREE.Group();
    bonsai.position.set(-p.shell * 0.1, p.shell * 0.74, -p.shell * 0.1);
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

  const rig = baseRig({ root, body, head, parts, limbs, companion: 'turtle', stage });
  rig.neck = neck;
  rig.height = lift + p.shell * 0.8 + p.head * 1.6;
  rig.headHome = neck.position.clone();
  rig.radius = p.shell * 1.15;
  rig.lift = lift;
  /** 0 = head out, 1 = fully tucked into the shell. */
  rig.tuck = (k) => {
    neck.position.z = rig.headHome.z - k * p.shell * 0.75;
    neck.position.y = rig.headHome.y - k * p.shell * 0.1;
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
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legLen = p.limb * 1.2;
  body.position.y = legLen + p.limb * 0.6;

  const torso = inked(new THREE.SphereGeometry(p.body, 26, 18), PALETTE.pandaWhite, { thickness: 0.014 });
  torso.scale.set(1, 1.08, 0.94);
  torso.position.y = p.body * 0.9;
  body.add(torso);
  const shoulders = plain(new THREE.TorusGeometry(p.body * 0.72, p.body * 0.24, 10, 24), PALETTE.pandaBlack);
  shoulders.rotation.x = Math.PI / 2;
  shoulders.position.y = p.body * 1.45;
  shoulders.scale.set(1, 0.85, 0.8);
  body.add(shoulders);

  const head = new THREE.Group();
  head.position.set(0, p.body * 1.85 + p.head * 0.62, p.body * 0.05);
  body.add(head);
  const skull = inked(new THREE.SphereGeometry(p.head, 26, 18), PALETTE.pandaWhite, { thickness: 0.014 });
  skull.scale.set(1.08, 0.95, 0.98);
  head.add(skull);
  for (const side of [-1, 1]) {
    const ear = inked(new THREE.SphereGeometry(p.head * 0.32, 14, 10), PALETTE.pandaBlack, { thickness: 0.01 });
    ear.position.set(side * p.head * 0.72, p.head * 0.72, -p.head * 0.12);
    ear.scale.z = 0.6;
    head.add(ear);
  }
  const muzzle = plain(new THREE.SphereGeometry(p.head * 0.36, 16, 12), PALETTE.white, { castShadow: false });
  muzzle.scale.set(1.2, 0.8, 0.7);
  muzzle.position.set(0, -p.head * 0.28, p.head * 0.78);
  head.add(muzzle);
  const nose = plain(new THREE.SphereGeometry(p.head * 0.1, 12, 8), PALETTE.ink, { castShadow: false });
  nose.scale.set(1.3, 0.8, 0.8);
  nose.position.set(0, -p.head * 0.16, p.head * 1.0);
  head.add(nose);
  const parts = face(head, {
    eyeR: p.eye,
    spread: p.head * 0.38,
    eyeY: p.head * 0.1,
    eyeZ: p.head * 0.9,
    mouthY: -p.head * 0.36,
    mouthZ: p.head * 1.0,
    blush: true,
    patches: true,
  });

  const limbs = {};
  for (const [key, x, y, z, len, rot] of [
    ['fl', -1, p.body * 1.25, p.body * 0.35, p.limb * 2.0, 0.5],
    ['fr', 1, p.body * 1.25, p.body * 0.35, p.limb * 2.0, 0.5],
    ['bl', -1, p.limb * 0.4, p.body * 0.1, legLen, 0],
    ['br', 1, p.limb * 0.4, p.body * 0.1, legLen, 0],
  ]) {
    const l = limb(p.limb, len, PALETTE.pandaBlack);
    l.position.set(x * p.body * (key.startsWith('f') ? 0.85 : 0.5), y, z);
    l.rotation.x = -rot;
    l.rotation.z = x * (key.startsWith('f') ? 0.35 : 0);
    body.add(l);
    limbs[key] = l;
  }
  const tail = plain(new THREE.SphereGeometry(p.limb * 0.7, 10, 8), PALETTE.pandaWhite);
  tail.position.set(0, p.body * 0.45, -p.body * 0.92);
  body.add(tail);

  // A bamboo stick the panda holds, used for eating; its size follows the stage.
  const snack = new THREE.Group();
  const stickLen = p.body * 1.4;
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
    head.add(leafTuft(p.head));
  } else if (stage === 3) {
    const band = inked(new THREE.TorusGeometry(p.head * 1.02, p.head * 0.07, 6, 24, Math.PI), PALETTE.headphones, { thickness: 0.006 });
    band.position.y = p.head * 0.05;
    head.add(band);
    for (const side of [-1, 1]) {
      const cup = inked(new THREE.CylinderGeometry(p.head * 0.26, p.head * 0.26, p.head * 0.16, 16), PALETTE.headphones, { thickness: 0.008 });
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * p.head * 1.02, -p.head * 0.05, 0);
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
      const b = plain(new THREE.SphereGeometry(p.limb * 0.2, 8, 6), PALETTE.woodDark, { castShadow: false });
      b.position.set(Math.cos(a) * p.limb * 1.05, 0, Math.sin(a) * p.limb * 1.05);
      beads.add(b);
    }
    beads.position.y = -p.limb * 1.6;
    limbs.fl.add(beads);
  }

  const rig = baseRig({ root, body, head, parts, limbs, companion: 'panda', stage });
  rig.snack = snack;
  rig.height = body.position.y + p.body * 1.85 + p.head * 1.6;
  rig.radius = p.body * 1.1;
  rig.lift = body.position.y;
  rig.tuck = () => {};
  return rig;
}

function leafTuft(headR) {
  const g = new THREE.Group();
  g.position.y = headR * 0.92;
  const stem = plain(new THREE.CylinderGeometry(0.008, 0.01, headR * 0.35, 6), PALETTE.bamboo);
  stem.position.y = headR * 0.15;
  g.add(stem);
  for (const side of [-1, 1]) {
    const leaf = inked(new THREE.SphereGeometry(headR * 0.22, 10, 6), PALETTE.mossLight, { thickness: 0.006 });
    leaf.scale.set(1.4, 0.3, 0.7);
    leaf.position.set(side * headR * 0.18, headR * 0.32, 0);
    leaf.rotation.z = side * -0.5;
    g.add(leaf);
  }
  return g;
}

function baseRig({ root, body, head, parts, limbs, companion, stage }) {
  const setExpression = makeExpressionSetter(parts);
  setExpression('neutral');
  const tmp = new THREE.Vector3();
  const look = { yaw: 0, pitch: 0, px: 0, py: 0 };

  return {
    companion,
    stage,
    root,
    body,
    head,
    limbs,
    parts,
    setExpression,
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
        yaw = THREE.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -1.0, 1.0) * 0.65 * strength;
        pitch = THREE.MathUtils.clamp(-Math.atan2(tmp.y, flat), -0.5, 0.45) * 0.6 * strength;
        const dir = tmp.normalize();
        px = THREE.MathUtils.clamp(dir.x, -1, 1);
        py = THREE.MathUtils.clamp(dir.y + 0.15, -1, 1);
      }
      const k = 1 - Math.exp(-dt * 10);
      look.yaw += (yaw - look.yaw) * k;
      look.pitch += (pitch - look.pitch) * k;
      look.px += (px - look.px) * Math.min(1, k * 1.6);
      look.py += (py - look.py) * Math.min(1, k * 1.6);
      head.rotation.y = look.yaw;
      head.rotation.x = look.pitch;
      for (const e of parts.eyes) {
        e.pupil.position.x = look.px * e.r * 0.34;
        e.pupil.position.y = look.py * e.r * 0.3;
      }
    },
  };
}
