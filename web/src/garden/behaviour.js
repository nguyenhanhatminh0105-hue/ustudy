import * as THREE from 'three';
import { buildTreat } from './treats.js';
import { spring } from './spring.js';

const TAU = Math.PI * 2;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const ease = (k) => 1 - Math.pow(1 - clamp01(k), 3);
const easeInOut = (k) => {
  const x = clamp01(k);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const lerp = (a, b, k) => a + (b - a) * k;
const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;

/** States that pose the body themselves; in every other state it eases back to standing. */
const POSED = new Set([
  'eat', 'nap', 'sleep', 'meditate', 'roll', 'pet', 'land', 'charge', 'special', 'gift', 'celebrate',
  'focus', 'dizzy', 'held', 'shake', 'enter', 'swim', 'dive', 'exitWater', 'flounder',
]);
const WALKING = new Set(['walk', 'approach', 'exitWater']);
const IN_WATER = new Set(['enter', 'swim', 'dive', 'exitWater', 'flounder']);
const SLEEPY = new Set(['nap', 'sleep', 'meditate', 'focus']);

/**
 * What the companion does, moment to moment. Ambient activities depend on
 * the companion, its life stage and what its garden offers; interactions
 * (pet, drag, hold, gift) interrupt them and then hand control back.
 *
 * Motion is built to feel weighted rather than mechanical: steps are tied to
 * the ground actually covered, speed ramps up and down, the body leans into
 * turns and squashes on springs, and breathing never repeats exactly.
 */
export function createBehaviour({ rig, world, effects, scene, night = false, calm = false, onEvent = () => {} }) {
  const A = world.affordances;
  const pos = rig.root.position;
  const isTurtle = rig.companion === 'turtle';
  const stage = rig.stage;
  const maxSpeed = (isTurtle ? 0.22 : 0.3) * (0.7 + stage * 0.12);
  const swingAmp = isTurtle ? 0.5 : 0.42;
  // Ground covered by one leg swing, so feet plant instead of sliding.
  const stride = Math.max(0.05, 2 * rig.legLength * Math.sin(swingAmp));

  let state = { name: 'idle', t: 0, dur: 2, data: {} };
  let heading = 0.25;
  let gait = 0;
  let speed = 0;
  let clicks = [];
  let mode = 'free'; // 'free' | 'focus'
  const look = { target: null, strength: 1 };
  let pendingGift = null;

  // Springs on rig.pose: lean into turns, pitch with speed changes, squash and stretch.
  const roll = spring({ stiffness: 55, damping: 8 });
  const pitch = spring({ stiffness: 55, damping: 8 });
  const squash = spring({ stiffness: 170, damping: 9, value: 1 });
  let lastHeading = heading;
  let lastSpeed = 0;
  let breathPhase = Math.random() * TAU;
  let paddle = 0;
  let paddleWant = 0;
  let paddlePhase = 0;

  pos.set(0, 0, 0.6);
  rig.root.rotation.y = heading;

  // ── helpers ─────────────────────────────────────────────────────
  const to = (name, data = {}, dur = Infinity) => {
    exit(state, name);
    state = { name, t: 0, dur, data };
    onEvent({ type: 'state', name });
  };
  const exit = (s, next) => {
    if (s.name === 'eat' && rig.snack) rig.snack.visible = stage === 2;
    if (s.name === 'special') rig.tuck(0);
    if ((s.name === 'nap' || s.name === 'sleep') && next !== 'wake') rig.tuck(0);
    // Unwind full turns (a finished roll is at 2π) so the body eases back the short way.
    for (const axis of ['x', 'y', 'z']) rig.body.rotation[axis] = wrap(rig.body.rotation[axis]);
    squash.target = 1;
    rig.droop = 0;
    look.strength = 1;
  };
  const headWorld = () => rig.head.getWorldPosition(v3());
  const easeTo = (obj, key, value, dt, rate = 8) => {
    obj[key] += (value - obj[key]) * Math.min(1, dt * rate);
  };
  const poseLimb = (limb, x, y, z, dt, rate = 8) => {
    easeTo(limb.rotation, 'x', x, dt, rate);
    easeTo(limb.rotation, 'y', y, dt, rate);
    easeTo(limb.rotation, 'z', z, dt, rate);
  };

  /** Turns the body around its middle, not its feet (rolling, somersaults). */
  function pivot(theta, axis) {
    const cy = rig.centerY;
    if (axis === 'z') {
      rig.body.rotation.z = theta;
      rig.body.position.x = Math.sin(theta) * cy;
      rig.body.position.z = 0;
    } else {
      rig.body.rotation.x = theta;
      rig.body.position.z = -Math.sin(theta) * cy;
      rig.body.position.x = 0;
    }
    rig.body.position.y = rig.lift + cy - Math.cos(theta) * cy;
  }

  function face(target, dt, rate = 6) {
    const want = angleTo(pos, target);
    heading += wrap(want - heading) * Math.min(1, dt * rate);
    rig.root.rotation.y = heading;
  }

  /** Walks toward a point with a speed that ramps up and eases off; returns true on arrival. */
  function walk(target, dt, top = maxSpeed) {
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.03) return true;
    face(target, dt, 5);
    const facing = Math.max(0, Math.cos(wrap(angleTo(pos, target) - heading)));
    const want = Math.min(top, d * 1.6 + 0.02) * (0.15 + 0.85 * facing);
    speed += (want - speed) * Math.min(1, dt * 4);
    const step = Math.min(d, speed * dt);
    pos.x += (dx / d) * step;
    pos.z += (dz / d) * step;
    gait += (step / stride) * Math.PI;
    return d - step < 0.03;
  }

  const crossesWater = (x, z, pad) => A.water.some((w) => Math.hypot(x - w.x, z - w.z) < w.r + pad);
  const segmentClear = (from, target) => {
    for (let i = 1; i <= 16; i += 1) {
      const k = i / 16;
      const x = from.x + (target.x - from.x) * k;
      const z = from.z + (target.z - from.z) * k;
      if (A.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + rig.radius * 0.6)) return false;
      if (crossesWater(x, z, rig.radius * 0.4)) return false;
      if (Math.hypot(x, z) > A.radius - 0.35) return false;
    }
    return true;
  };

  /** A waypoint around whatever blocks the straight line, or null if the line is clear. */
  function detour(target) {
    if (segmentClear(pos, target)) return null;
    let best = null;
    const blockers = [...A.water.map((w) => ({ x: w.x, z: w.z, r: w.r + rig.radius + 0.25 })), ...A.obstacles.map((o) => ({ x: o.x, z: o.z, r: o.r + rig.radius + 0.2 }))];
    for (const b of blockers) {
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * TAU;
        const c = v3(b.x + Math.sin(a) * b.r, 0, b.z + Math.cos(a) * b.r);
        if (!A.isOpen(c.x, c.z, rig.radius * 0.5) || !segmentClear(pos, c) || !segmentClear(c, target)) continue;
        const length = pos.distanceTo(c) + c.distanceTo(target);
        if (!best || length < best.length) best = { c, length };
      }
    }
    return best?.c ?? null;
  }

  /** Walks somewhere (around ponds and stones if needed), then does `then`. */
  function go(target, then = 'idle', extra = {}) {
    const via = detour(target);
    to('approach', via ? { target: via, next: target, then, ...extra } : { target, then, ...extra });
  }

  function randomOpenPoint(near = null, maxR = 1.4) {
    for (let i = 0; i < 24; i += 1) {
      const a = Math.random() * TAU;
      const r = Math.random() * (near ? maxR : A.radius - 0.5);
      const x = (near?.x ?? 0) + Math.cos(a) * r;
      const z = (near?.z ?? 0) + Math.sin(a) * r;
      // Prefer the front half of the garden so the companion stays in view.
      if (z < -A.radius * 0.55 && Math.random() < 0.7) continue;
      if (A.isOpen(x, z, rig.radius) && segmentClear(pos, { x, z })) return v3(x, 0, z);
    }
    return null;
  }

  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // ── water ───────────────────────────────────────────────────────
  /** Root height when floating: the shell (or the panda's chest) rides at the waterline. */
  const floatY = (w) => w.surface - rig.floatY * rig.scale;
  /** Root height at the bottom of a dive: just under the surface, or resting on the pond floor. */
  const diveY = (w) => Math.max(w.bed - rig.lift * rig.scale * 0.3, w.surface - 0.06 - rig.topY * rig.scale);

  /** The circle to swim around: clear of the sloping walls and of any island. */
  function orbitFor(w) {
    const limit = Math.max(0, Math.min(w.r - 0.05 - rig.radius, w.r * 0.86 - rig.radius * 0.85));
    if (!w.island) return { x: w.x, z: w.z, R: limit };
    const dx = w.island.x - w.x;
    const dz = w.island.z - w.z;
    const D = Math.hypot(dx, dz) || 1;
    const shift = Math.max(0, (limit - D + w.island.r + rig.radius) / 2);
    return { x: w.x - (dx / D) * shift, z: w.z - (dz / D) * shift, R: Math.max(0, limit - shift) };
  }

  /** Where to climb out: a point just inside the edge and open ground just outside it. */
  function shorePlan(w, toward = null) {
    const base = toward ? angleTo(w, toward) : angleTo(w, pos);
    const at = (a, r) => v3(w.x + Math.sin(a) * r, 0, w.z + Math.cos(a) * r);
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3, Math.PI]) {
      const a = base + off;
      const outside = at(a, w.r + rig.radius * 0.8 + 0.1);
      if (A.isOpen(outside.x, outside.z, rig.radius * 0.5)) return { inside: at(a, Math.max(0, w.r - rig.radius * 0.9)), outside };
    }
    return { inside: at(base, Math.max(0, w.r - rig.radius * 0.9)), outside: at(base, w.r + rig.radius * 0.8 + 0.1) };
  }

  function splash(w, at, strength = 1) {
    w.pond.userData.ripple(at.x - w.x, at.z - w.z, strength);
    effects.spawn('drop', v3(at.x, w.surface + 0.05, at.z), { count: Math.round(3 + strength * 4), size: 0.05, gravity: 3, velocity: v3(0, 1.4 * strength, 0) });
  }

  const pondNow = () => state.data.pond ?? A.inWater(pos.x, pos.z) ?? null;

  /** Puts a swimming companion straight onto the nearest bank (for gifts and focus mode). */
  function bankNow() {
    const w = pondNow();
    if (!w) return;
    const { outside } = shorePlan(w);
    pos.copy(outside);
    pos.y = 0;
    paddle = 0;
  }

  /** Chooses the next ambient activity, weighted by what this garden offers. */
  function nextActivity() {
    if (calm || mode === 'focus') return to('idle', {}, 4);
    if (night && Math.random() < 0.55) {
      const spot = A.napSpots[0] ?? (isTurtle ? A.baskStones[0] : null);
      return go(spot ? v3(spot.x, 0, spot.z + 0.25) : pos.clone(), 'sleep');
    }
    const options = [['wander', 3], ['idle', 2]];
    if (isTurtle) {
      if (A.water.length) options.push(['swim', 3]);
      if (A.baskStones.length) options.push(['bask', 1.6]);
      if (A.koi.length && stage >= 3) options.push(['koi', 1.4]);
      if (stage <= 2) options.push(['nap', 0.6]);
    } else {
      if (A.bamboo.length) options.push(['eat', 2.2]);
      if (A.bamboo.some((b) => b.h > 1.2) && stage >= 3) options.push(['climb', 1.6]);
      if (A.napSpots.length) options.push(['nap', 1.2]);
      if (A.seat) options.push(['meditate', 2.2]);
      if (stage <= 2) options.push(['roll', 0.9]);
      if (A.water.length) options.push(['paddle', 0.6]);
    }
    const total = options.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    let choice = options[0][0];
    for (const [name, w] of options) {
      r -= w;
      if (r <= 0) {
        choice = name;
        break;
      }
    }
    startActivity(choice);
  }

  function startActivity(name) {
    switch (name) {
      case 'wander': {
        const p = randomOpenPoint();
        return p ? to('walk', { target: p }) : to('idle', {}, 2);
      }
      case 'swim': {
        const w = pick(A.water);
        return go(shorePlan(w).outside, 'enter', { pond: w });
      }
      case 'bask': {
        const s = pick(A.baskStones);
        return go(v3(s.x, 0, s.z + s.r + 0.12), 'bask', { stone: s });
      }
      case 'koi': {
        const w = A.water[0];
        return go(shorePlan(w, v3(0, 0, A.radius)).outside, 'koi', { pond: w });
      }
      case 'nap': {
        const spot = A.napSpots.length ? pick(A.napSpots) : null;
        const target = spot ? v3(spot.x, 0, spot.z) : randomOpenPoint(pos, 0.8) ?? pos.clone();
        return go(target, 'nap');
      }
      case 'eat':
      case 'climb': {
        const tall = name === 'climb' ? A.bamboo.filter((b) => b.h > 1.2) : A.bamboo;
        const b = pick(tall);
        const a = angleTo(b, v3(0, 0, A.radius));
        return go(v3(b.x + Math.sin(a) * 0.3, 0, b.z + Math.cos(a) * 0.3), name, { bamboo: b });
      }
      case 'meditate':
        return go(v3(A.seat.x, 0, A.seat.z + 0.05), 'meditate');
      case 'roll': {
        // Roll sideways along the ground, if there is room; otherwise roll on the spot.
        const dir = Math.random() < 0.5 ? -1 : 1;
        const dist = TAU * rig.centerY * rig.scale * 0.5;
        const side = v3(-Math.cos(heading) * dir, 0, Math.sin(heading) * dir);
        const dest = pos.clone().addScaledVector(side, dist);
        const room = A.isOpen(dest.x, dest.z, rig.radius) && segmentClear(pos, dest);
        return to('roll', { dir, from: pos.clone(), dest: room ? dest : pos.clone() }, 1.9);
      }
      case 'paddle': {
        const w = pick(A.water);
        const { outside } = shorePlan(w);
        const a = angleTo(w, outside);
        return go(v3(w.x + Math.sin(a) * (w.r + rig.radius * 0.6), 0, w.z + Math.cos(a) * (w.r + rig.radius * 0.6)), 'paddle', { pond: w });
      }
      default:
        return to('idle', {}, 2 + Math.random() * 2);
    }
  }

  // ── per-state frame logic ───────────────────────────────────────
  const states = {
    idle() {
      rig.setExpression('neutral');
      if (state.t > state.dur) nextActivity();
    },
    walk(dt) {
      rig.setExpression('neutral');
      const d = state.data;
      if (walk(d.target, dt) || state.t > 14) {
        if (d.next) {
          d.target = d.next;
          d.next = null;
          return;
        }
        to('idle', {}, 1 + Math.random() * 2);
      }
    },
    approach(dt) {
      rig.setExpression('neutral');
      const { target, next, then, ...rest } = state.data;
      if (walk(target, dt) || state.t > 16) {
        if (next) {
          state.data.target = next;
          state.data.next = null;
          return;
        }
        to(then, rest, stateDuration(then));
      }
    },

    // Turtle: crouch on the bank, hop in, splash.
    enter(dt) {
      const d = state.data;
      const w = d.pond;
      if (!d.from) {
        d.from = pos.clone();
        d.to = shorePlan(w, pos).inside;
      }
      face(d.to, dt, 8);
      rig.setExpression('happy');
      if (state.t < 0.24) {
        squash.target = 0.8; // wind up
        return;
      }
      squash.target = 1;
      if (!d.jumped) {
        d.jumped = true;
        squash.kick(3);
      }
      const j = clamp01((state.t - 0.24) / 0.55);
      pos.x = lerp(d.from.x, d.to.x, j);
      pos.z = lerp(d.from.z, d.to.z, j);
      pos.y = lerp(0, floatY(w), j) + Math.sin(j * Math.PI) * 0.22;
      rig.body.rotation.x = lerp(-0.25, 0.35, j);
      if (j >= 1) {
        splash(w, pos, 1.1);
        squash.kick(-3);
        to('swim', { pond: w }, stateDuration('swim'));
      }
    },

    // Turtle: paddle around the pond with the shell riding the waterline; now and then, dive.
    swim(dt, t) {
      const d = state.data;
      const w = d.pond;
      const o = (d.orbit ??= orbitFor(w));
      d.angle ??= Math.atan2(pos.x - o.x, pos.z - o.z);
      d.angle += dt * (0.13 / Math.max(o.R, 0.18));
      const target = v3(o.x + Math.sin(d.angle) * o.R, 0, o.z + Math.cos(d.angle) * o.R);
      pos.x += (target.x - pos.x) * Math.min(1, dt * 1.6);
      pos.z += (target.z - pos.z) * Math.min(1, dt * 1.6);
      face(v3(o.x + Math.sin(d.angle + 0.5) * o.R, 0, o.z + Math.cos(d.angle + 0.5) * o.R), dt, 2.5);
      pos.y += (floatY(w) + Math.sin(t * 1.7) * 0.008 - pos.y) * Math.min(1, dt * 3);
      paddleWant = 1;
      paddlePhase += dt * 4.2;
      rig.body.rotation.z = Math.sin(paddlePhase) * 0.06;
      easeTo(rig.body.rotation, 'x', -0.06, dt, 4);
      rig.setExpression(Math.sin(t * 0.9) > 0.55 ? 'happy' : 'neutral');
      if (Math.random() < dt * 1.5) w.pond.userData.ripple(pos.x - w.x, pos.z - w.z, 0.35);
      if (!d.dived && state.t > 2.5 && Math.random() < dt * 0.3) {
        return to('dive', { pond: w, orbit: o, angle: d.angle, left: state.dur - state.t }, 4.8);
      }
      if (state.t > state.dur) to('exitWater', { pond: w, toward: d.toward, then: d.then });
    },

    // Turtle: tip nose-down, glide along the bottom trailing bubbles, then come back up.
    dive(dt, t) {
      const d = state.data;
      const w = d.pond;
      const o = d.orbit;
      const k = state.t;
      d.angle += dt * (0.09 / Math.max(o.R, 0.18));
      const target = v3(o.x + Math.sin(d.angle) * o.R, 0, o.z + Math.cos(d.angle) * o.R);
      pos.x += (target.x - pos.x) * Math.min(1, dt * 1.6);
      pos.z += (target.z - pos.z) * Math.min(1, dt * 1.6);
      face(v3(o.x + Math.sin(d.angle + 0.5) * o.R, 0, o.z + Math.cos(d.angle + 0.5) * o.R), dt, 2.5);
      const top = floatY(w);
      const deep = diveY(w);
      const down = 1.0;
      const up = 1.2;
      if (!d.splashed) {
        d.splashed = true;
        w.pond.userData.ripple(pos.x - w.x, pos.z - w.z, 0.9);
        effects.spawn('drop', v3(pos.x, w.surface + 0.05, pos.z), { count: 3, size: 0.04, gravity: 3, velocity: v3(0, 0.9, 0) });
      }
      if (k < down) {
        const j = easeInOut(k / down);
        pos.y = lerp(top, deep, j);
        rig.body.rotation.x = 0.55 * Math.sin(j * Math.PI);
      } else if (k < state.dur - up) {
        pos.y = deep + Math.sin(t * 1.3) * 0.01;
        easeTo(rig.body.rotation, 'x', 0, dt, 4);
      } else {
        const j = easeInOut((k - (state.dur - up)) / up);
        pos.y = lerp(deep, top, j);
        rig.body.rotation.x = -0.5 * Math.sin(j * Math.PI);
      }
      rig.body.rotation.z = Math.sin(paddlePhase) * 0.04;
      paddleWant = 1;
      paddlePhase += dt * 3;
      rig.setExpression('neutral');
      if (pos.y < top - 0.08 && Math.random() < dt * 2.5) {
        effects.spawn('drop', headWorld(), { size: 0.03, gravity: -1.2, velocity: v3((Math.random() - 0.5) * 0.1, 0.15, 0), life: 0.9 });
      }
      if (k >= state.dur) {
        w.pond.userData.ripple(pos.x - w.x, pos.z - w.z, 0.7);
        to('swim', { pond: w, orbit: o, angle: d.angle, dived: true }, Math.max(1.5, d.left));
      }
    },

    // Swim to the edge, then crouch and hop up onto the bank (the panda shakes off afterwards).
    exitWater(dt) {
      const d = state.data;
      const w = d.pond;
      d.plan ??= shorePlan(w, d.toward);
      if (!d.hopping) {
        paddleWant = 1;
        paddlePhase += dt * (isTurtle ? 5 : 9);
        pos.y += (floatY(w) - pos.y) * Math.min(1, dt * 3);
        easeTo(rig.body.rotation, 'x', -0.08, dt, 4);
        const arrived = walk(d.plan.inside, dt, isTurtle ? 0.2 : 0.16);
        if (Math.random() < dt * 2) w.pond.userData.ripple(pos.x - w.x, pos.z - w.z, 0.35);
        if (arrived || state.t > 7) {
          d.hopping = true;
          d.t0 = state.t;
          d.from = pos.clone();
        }
        return;
      }
      const k = state.t - d.t0;
      face(d.plan.outside, dt, 8);
      if (k < 0.25) {
        squash.target = 0.8;
        return;
      }
      squash.target = 1;
      if (!d.kicked) {
        d.kicked = true;
        squash.kick(3);
        splash(w, pos, 0.6);
      }
      const j = clamp01((k - 0.25) / 0.5);
      pos.x = lerp(d.from.x, d.plan.outside.x, j);
      pos.z = lerp(d.from.z, d.plan.outside.z, j);
      pos.y = lerp(d.from.y, 0, j) + Math.sin(j * Math.PI) * 0.25;
      rig.body.rotation.x = lerp(-0.35, 0, j);
      if (j >= 1) {
        pos.y = 0;
        squash.kick(-2.5);
        effects.spawn('drop', pos.clone().add(v3(0, 0.15, 0)), { count: 3, size: 0.04, gravity: 3, velocity: v3(0, 0.5, 0) });
        if (!isTurtle) return to('shake', {}, 1.2);
        if (d.then) return to(d.then.name, d.then.data ?? {}, d.then.dur ?? Infinity);
        to('idle', {}, 1);
      }
    },

    // Panda dropped in the water: a startled scramble, then out it climbs.
    flounder(dt, t) {
      const w = state.data.pond;
      paddleWant = 1;
      paddlePhase += dt * 10;
      pos.y += (floatY(w) + Math.sin(t * 8) * 0.012 - pos.y) * Math.min(1, dt * 4);
      // Drift away from the walls rather than through them.
      const room = Math.max(0, w.r - rig.radius * 0.8);
      const off = Math.hypot(pos.x - w.x, pos.z - w.z);
      if (off > room) {
        pos.x += ((w.x + ((pos.x - w.x) / off) * room) - pos.x) * Math.min(1, dt * 6);
        pos.z += ((w.z + ((pos.z - w.z) / off) * room) - pos.z) * Math.min(1, dt * 6);
      }
      rig.body.rotation.z = Math.sin(t * 9) * 0.08;
      rig.setExpression('surprised');
      if (Math.random() < dt * 5) splash(w, pos, 0.3);
      if (state.t > 1.1) to('exitWater', { pond: w });
    },

    bask(dt) {
      const s = state.data.stone;
      const k = ease(state.t / 0.6);
      pos.x += (s.x - pos.x) * k * dt * 4;
      pos.z += (s.z - pos.z) * k * dt * 4;
      pos.y = s.top * k;
      rig.setExpression(state.t > 1 ? 'calm' : 'happy');
      rig.droop = state.t > 1 ? 0.12 : 0;
      if (Math.random() < dt * 0.6) effects.spawn('sparkle', headWorld().add(v3(0, 0.15, 0)), { size: 0.08, rise: 0.3 });
      if (state.t > state.dur) {
        pos.y = 0;
        to('walk', { target: randomOpenPoint(pos, 1) ?? v3(s.x, 0, s.z + s.r + 0.3) });
      }
    },
    koi(dt) {
      const w = state.data.pond;
      face(v3(w.x, 0, w.z), dt);
      if (!state.data.fed) {
        state.data.fed = true;
        const local = { x: pos.x - w.x, z: pos.z - w.z };
        const d = Math.hypot(local.x, local.z) || 1;
        const spot = { x: (local.x / d) * (w.r - 0.3), z: (local.z / d) * (w.r - 0.3) };
        for (const fish of A.koi) fish.userData.feed(spot.x, spot.z, state.dur);
        w.pond.userData.ripple(spot.x, spot.z, 0.8);
      }
      rig.setExpression(Math.sin(state.t * 2) > 0.6 ? 'happy' : 'neutral');
      if (Math.random() < dt * 0.8) effects.spawn('crumb', headWorld().add(v3(0, -0.05, 0.2)), { size: 0.04, rise: -0.3, gravity: 1.5 });
      if (state.t > state.dur) to('idle', {}, 1.5);
    },

    // Settle down for a snooze: the turtle sinks onto its belly and half-hides; the panda sits and slumps.
    nap(dt) {
      rig.setExpression('sleep');
      const k = ease(state.t / 1.2);
      rig.droop = 0.32 * k;
      if (isTurtle) {
        rig.tuck(0.3 * k);
        rig.body.position.y = rig.lift * (1 - 0.6 * k);
      } else {
        rig.body.position.y = rig.lift * (1 - 0.72 * k);
        rig.body.rotation.x = 0.16 * k;
        poseLimb(rig.limbs.fl, -0.95, 0, -0.25, dt, 4);
        poseLimb(rig.limbs.fr, -0.95, 0, 0.25, dt, 4);
        poseLimb(rig.limbs.bl, -1.35, 0, -0.2, dt, 4);
        poseLimb(rig.limbs.br, -1.35, 0, 0.2, dt, 4);
      }
      if (Math.random() < dt * 0.9) effects.spawn('z', headWorld().add(v3(0.1, 0.18, 0)), { size: 0.1, rise: 0.35, life: 1.8 });
      if (state.t > state.dur) to('wake', {}, 0.9);
    },
    sleep(dt) {
      states.nap(dt);
      if (!night && state.t > 4 && state.name === 'sleep') to('wake', {}, 0.9);
    },
    // A stretch on waking, instead of snapping straight up.
    wake(dt) {
      const k = state.t / state.dur;
      if (isTurtle) rig.tuck(0.3 * (1 - ease(k / 0.5)));
      squash.target = k < 0.55 ? 1.1 : 1;
      rig.setExpression(k < 0.4 ? 'calm' : 'neutral');
      if (!state.data.sparkled) {
        state.data.sparkled = true;
        effects.spawn('sparkle', headWorld(), { size: 0.06, rise: 0.3 });
      }
      if (k >= 1) to('idle', {}, 1.5);
    },
    eat(dt, t) {
      const b = state.data.bamboo;
      face(v3(b.x, 0, b.z), dt);
      if (rig.snack) rig.snack.visible = true;
      // Sit, raise the stick, chew.
      easeTo(rig.body.position, 'y', rig.lift * 0.55, dt, 6);
      poseLimb(rig.limbs.fr, -1.6 + Math.sin(t * 6) * 0.15, 0, 0.35, dt, 10);
      poseLimb(rig.limbs.bl, -1.2, 0, -0.15, dt, 5);
      poseLimb(rig.limbs.br, -1.2, 0, 0.15, dt, 5);
      rig.setExpression(Math.sin(t * 8) > 0 ? 'eat' : 'happy');
      if (Math.random() < dt * 1.5) effects.spawn('leaf', headWorld().add(v3(0, -0.05, 0.15)), { size: 0.05, rise: -0.1, gravity: 0.8 });
      if (state.t > state.dur) to('idle', {}, 1);
    },
    climb(dt, t) {
      const b = state.data.bamboo;
      const top = b.h * 0.42;
      const phase = state.t;
      face(v3(b.x, 0, b.z), dt);
      // hug the stalk
      const hug = v3(b.x + (pos.x - b.x) * 0.5, 0, b.z + (pos.z - b.z) * 0.5);
      if (phase < 0.4) {
        pos.x += (hug.x - pos.x) * dt * 6;
        pos.z += (hug.z - pos.z) * dt * 6;
      }
      let y;
      if (phase < 2.6) y = top * ease((phase - 0.4) / 2.2);
      else if (phase < 5.5) y = top + Math.sin((phase - 2.6) * 2) * 0.03;
      else y = top * (1 - ease((phase - 5.5) / 1.6));
      pos.y = Math.max(0, y);
      const climbing = phase < 2.6 || phase > 5.5;
      rig.limbs.fl.rotation.x = -2.4 + Math.sin(t * 9) * (climbing ? 0.4 : 0.05);
      rig.limbs.fr.rotation.x = -2.4 - Math.sin(t * 9) * (climbing ? 0.4 : 0.05);
      rig.limbs.bl.rotation.x = -0.6 - Math.sin(t * 9) * (climbing ? 0.35 : 0.02);
      rig.limbs.br.rotation.x = -0.6 + Math.sin(t * 9) * (climbing ? 0.35 : 0.02);
      // at the top, turn the head to the viewer
      look.strength = phase > 2.6 && phase < 5.5 ? 1 : 0.3;
      rig.setExpression(phase > 2.6 && phase < 5.5 ? 'happy' : 'neutral');
      if (phase > 7.1) {
        pos.y = 0;
        squash.kick(-2.5);
        to('walk', { target: randomOpenPoint(pos, 1) ?? pos.clone() });
      }
    },
    meditate(dt) {
      face(v3(0, 0, A.radius * 2), dt, 2);
      const k = ease(state.t / 1);
      pos.y = A.seat.y * k;
      rig.body.position.y = rig.lift * (1 - 0.5 * k);
      rig.setExpression('calm');
      poseLimb(rig.limbs.fl, -0.9, 0, -0.2, dt, 4);
      poseLimb(rig.limbs.fr, -0.9, 0, 0.2, dt, 4);
      poseLimb(rig.limbs.bl, -1.4, 0, -0.5, dt, 4);
      poseLimb(rig.limbs.br, -1.4, 0, 0.5, dt, 4);
      if (Math.random() < dt * 0.4) effects.spawn('leaf', headWorld().add(v3((Math.random() - 0.5) * 0.6, 0.5, 0)), { size: 0.05, rise: -0.15, life: 2.4 });
      if (state.t > state.dur) {
        pos.y = 0;
        to('walk', { target: randomOpenPoint(pos, 1.2) ?? pos.clone() });
      }
    },
    // Crouch, then roll over sideways along the ground and land with a bounce.
    roll() {
      const d = state.data;
      rig.setExpression('happy');
      if (state.t < 0.3) {
        squash.target = 0.8;
        return;
      }
      squash.target = 1;
      const j = clamp01((state.t - 0.3) / (state.dur - 0.3));
      const k = easeInOut(j);
      pivot(TAU * k * d.dir, 'z');
      pos.x = lerp(d.from.x, d.dest.x, k);
      pos.z = lerp(d.from.z, d.dest.z, k);
      if (j >= 1) {
        squash.kick(-3);
        to('idle', {}, 1);
      }
    },
    paddle(dt) {
      const w = state.data.pond;
      face(v3(w.x, 0, w.z), dt);
      poseLimb(rig.limbs.fl, -1.2 + Math.sin(state.t * 10) * 0.5, 0, -0.35, dt, 14);
      rig.setExpression(Math.sin(state.t * 3) > 0 ? 'happy' : 'surprised');
      if (Math.random() < dt * 3) {
        const local = { x: pos.x - w.x, z: pos.z - w.z };
        w.pond.userData.ripple(local.x * 0.8, local.z * 0.8, 0.4);
        effects.spawn('drop', headWorld().add(v3(0, -0.1, 0.2)), { size: 0.05, gravity: 2.5, velocity: v3(0, 1, 0.3) });
      }
      if (state.t > state.dur) to('idle', {}, 1);
    },

    // ── interaction states ──
    pet() {
      const k = state.t / 0.55;
      rig.body.position.y = rig.lift + Math.sin(Math.min(1, k) * Math.PI) * 0.1;
      rig.setExpression('happy');
      if (k >= 1.6) to('idle', {}, 1.2);
    },
    dizzy(dt, t) {
      rig.setExpression('dizzy');
      rig.body.rotation.z = Math.sin(t * 6) * 0.15 * (1 - state.t / 2.6);
      rig.droop = 0.15;
      if (Math.random() < dt * 3) effects.spawn('swirl', headWorld().add(v3(0, 0.15, 0)), { size: 0.09, rise: 0.15 });
      if (state.t > 2.2) to('idle', {}, 1);
    },
    held(dt, t) {
      const target = state.data.target;
      const vx = (target.x - pos.x) * Math.min(1, dt * 14);
      pos.x += vx;
      pos.z += (target.z - pos.z) * Math.min(1, dt * 14);
      pos.y += (0.55 + Math.sin(t * 5) * 0.03 - pos.y) * Math.min(1, dt * 10);
      // dangle: limbs kick, body swings against the motion and overshoots
      for (const [i, l] of Object.values(rig.limbs).entries()) l.rotation.x = Math.sin(t * 14 + i * 1.7) * 0.6 + (l.userData.rest?.x ?? 0);
      roll.kick(-vx * 40);
      rig.setExpression(state.t < 0.6 ? 'surprised' : 'happy');
      if (isTurtle && state.t < 0.4) rig.tuck(0.5 - state.t);
    },
    fall(dt) {
      state.data.vy -= 9.8 * dt;
      pos.y += state.data.vy * dt;
      squash.target = 1.08; // stretch while falling
      if (pos.y <= state.data.floor) {
        pos.y = state.data.floor;
        land(state.data.landing);
      }
    },
    land() {
      const k = state.t / 0.45;
      rig.setExpression(k < 0.5 ? 'surprised' : 'happy');
      if (k >= 1) {
        const after = state.data.after;
        if (after) to(after.name, after.data, after.dur);
        else to('idle', {}, 1.2);
      }
    },
    shake(dt, t) {
      // panda after a splash: shake the water off, head to tail
      const fade = 1 - state.t / 1.2;
      rig.body.rotation.y = Math.sin(t * 30) * 0.35 * fade;
      rig.body.rotation.z = Math.sin(t * 30 + 1.2) * 0.08 * fade;
      rig.setExpression(state.t < 0.6 ? 'surprised' : 'calm');
      if (Math.random() < dt * 12 * fade) effects.spawn('drop', headWorld(), { size: 0.045, gravity: 3, velocity: v3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2) });
      if (state.t > 1.2) {
        const out = randomOpenPoint(pos, 1.2) ?? v3(0, 0, A.radius * 0.5);
        to('walk', { target: out });
      }
    },
    charge(dt, t) {
      const k = Math.min(1, state.t / 0.85);
      rig.body.position.x = Math.sin(t * 60) * 0.012 * k;
      squash.target = 1 - k * 0.12;
      rig.setExpression('surprised');
      if (Math.random() < dt * 8 * k) effects.spawn('sparkle', pos.clone().add(v3((Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.6)), { size: 0.06, rise: 0.5, life: 0.6 });
      if (state.t >= 0.85) {
        squash.target = 1;
        squash.kick(3);
        to('special', {}, isTurtle ? 1.8 : 1.4);
      }
    },
    special() {
      const k = state.t / state.dur;
      if (isTurtle) {
        // hide in the shell and spin like a top, then pop back out
        rig.body.position.x = 0;
        rig.tuck(k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2);
        rig.body.rotation.y = TAU * 3 * ease(Math.min(1, k / 0.8));
        rig.setExpression(k < 0.8 ? 'sleep' : 'happy');
      } else {
        // a forward somersault, turning around its middle, with a hop
        pivot(TAU * easeInOut(k), 'x');
        rig.body.position.y += Math.sin(k * Math.PI) * 0.2;
        rig.setExpression('happy');
      }
      if (k >= 1) {
        squash.kick(-3);
        effects.spawn('sparkle', headWorld().add(v3(0, 0.2, 0)), { count: 6, spread: 0.5, size: 0.09 });
        onEvent({ type: 'special' });
        to('pet', {}, 1);
      }
    },
    gift(dt, t) {
      const d = state.data;
      const reach = rig.radius * 0.75; // in front of the face, outside the head
      const mouth = headWorld().add(v3(Math.sin(heading) * reach, -0.08, Math.cos(heading) * reach));
      face(v3(pos.x, 0, pos.z + 1), dt, 4); // turn to the viewer to receive it
      if (state.t < 1.0) {
        // the treat floats down from above
        const k = ease(state.t / 1.0);
        d.treat.position.lerpVectors(d.from, mouth, k);
        d.treat.rotation.y += dt * 3;
        rig.setExpression('surprised');
        look.target = d.treat.position;
      } else if (state.t < 2.6) {
        // three chomps, each with a little bounce
        const chomp = Math.floor((state.t - 1.0) / 0.5);
        if (chomp !== d.chomp) {
          d.chomp = chomp;
          squash.kick(-1.5);
        }
        const s = Math.max(0.05, 1 - chomp * 0.33);
        d.treat.scale.setScalar(s * d.size);
        d.treat.position.copy(mouth);
        rig.setExpression(Math.sin(t * 14) > 0 ? 'eat' : 'happy');
        if (d.treatId === 'cookie' && Math.random() < dt * 8) effects.spawn('crumb', mouth, { size: 0.035, gravity: 2.4, velocity: v3(0, 0.6, 0.3) });
        if (d.treatId === 'milk' && Math.random() < dt * 4) effects.spawn('drop', mouth, { size: 0.035, gravity: 1.2, velocity: v3(0, 0.4, 0.2) });
      } else {
        if (d.treat.parent) {
          d.treat.parent.remove(d.treat);
          reactToTreat(d.treatId);
        }
        const k = (state.t - 2.6) / d.react;
        if (stage === 4) {
          // grown-ups say thank you with a slow bow
          rig.body.rotation.x = Math.sin(Math.min(1, k) * Math.PI) * 0.45;
          rig.setExpression('calm');
        } else if (d.treatId === 'cake') {
          rig.body.rotation.y = TAU * easeInOut(k);
          rig.body.position.y = rig.lift + Math.abs(Math.sin(k * Math.PI * 3)) * 0.1;
          rig.setExpression('love');
        } else {
          rig.body.position.y = rig.lift + Math.abs(Math.sin(k * Math.PI * (d.treatId === 'cookie' ? 2 : 1))) * 0.1;
          rig.setExpression('happy');
        }
        if (k >= 1) {
          look.target = null;
          d.resolve();
          to('idle', {}, 1.5);
        }
      }
    },
    celebrate() {
      const k = state.t / state.dur;
      const hop = Math.abs(Math.sin(k * Math.PI * 3));
      rig.body.position.y = rig.lift + hop * 0.14;
      if (hop < 0.08 && state.t - (state.data.lastKick ?? -1) > 0.2) {
        state.data.lastKick = state.t;
        squash.kick(-2);
      }
      rig.setExpression('happy');
      if (k >= 1) to('idle', {}, 1);
    },
    focus() {
      // During a focus session: settle down, breathe slowly, eyes closed.
      rig.setExpression('calm');
      rig.droop = 0.1;
      if (!isTurtle) rig.body.position.y = rig.lift * 0.6;
    },
  };

  function stateDuration(name) {
    return {
      swim: 7 + Math.random() * 5,
      bask: 5 + Math.random() * 4,
      koi: 5,
      nap: 6 + Math.random() * 4,
      sleep: 12,
      eat: 4 + Math.random() * 2,
      climb: 7.2,
      meditate: 8 + Math.random() * 5,
      paddle: 2.5,
    }[name] ?? 3;
  }

  function land(where) {
    const water = A.inWater(pos.x, pos.z);
    if (water) {
      splash(water, pos, 1.4);
      squash.kick(-3);
      if (isTurtle) {
        onEvent({ type: 'splash', happy: true });
        return to('swim', { pond: water }, 6);
      }
      onEvent({ type: 'splash', happy: false });
      return to('flounder', { pond: water });
    }
    squash.kick(-4);
    const stone = A.baskStones.find((s) => Math.hypot(pos.x - s.x, pos.z - s.z) < s.r + 0.1);
    if (stone && isTurtle) return to('land', { after: { name: 'bask', data: { stone }, dur: 5 } });
    const stalk = A.bamboo.find((b) => Math.hypot(pos.x - b.x, pos.z - b.z) < 0.45);
    if (stalk && !isTurtle && stage >= 2) {
      const tall = stalk.h > 1.2 && stage >= 3;
      return to('land', { after: { name: tall ? 'climb' : 'eat', data: { bamboo: stalk }, dur: tall ? 7.2 : 4 } });
    }
    return to('land', where ?? {});
  }

  function reactToTreat(id) {
    const at = headWorld().add(v3(0, 0.18, 0));
    if (id === 'cake') effects.spawn('heart', at, { count: 7, spread: 0.5, size: 0.12, rise: 0.7 });
    else if (id === 'cookie') effects.spawn('note', at, { count: 3, spread: 0.3, size: 0.1, rise: 0.5 });
    else effects.spawn('sparkle', at, { count: 4, spread: 0.35, size: 0.08, rise: 0.5 });
    if (stage === 4) effects.spawn('leaf', at, { count: 3, spread: 0.5, size: 0.06, rise: 0.25, life: 2 });
    onEvent({ type: 'gift-eaten', treat: id });
  }

  // ── animation that runs in every state ──────────────────────────
  function limbsBusy() {
    if (['held', 'eat', 'climb', 'meditate', 'paddle'].includes(state.name)) return true;
    return !isTurtle && (state.name === 'nap' || state.name === 'sleep');
  }

  function animateBody(dt, t) {
    if (!WALKING.has(state.name)) speed += (0 - speed) * Math.min(1, dt * 8);
    const pace = clamp(speed / (maxSpeed * 0.5), 0, 1);
    const swing = Math.sin(gait) * swingAmp * pace;
    paddle += (paddleWant - paddle) * Math.min(1, dt * 5);

    if (!limbsBusy()) {
      for (const [key, l] of Object.entries(rig.limbs)) {
        const rest = l.userData.rest ?? { x: 0, y: 0, z: 0 };
        const front = key[0] === 'f';
        const side = key[1] === 'l' ? -1 : 1;
        // Diagonal pairs swing together, like a real four-legged walk.
        const diag = key === 'fl' || key === 'br' ? 1 : -1;
        let x = rest.x + swing * diag;
        let y = rest.y;
        let z = rest.z;
        if (paddle > 0.001) {
          let px;
          let py;
          let pz;
          if (isTurtle) {
            // Flippers out to the sides, sweeping back and forth: front pair strong, back pair kicking.
            const phase = paddlePhase + (front ? 0 : Math.PI);
            px = 0.2;
            py = side * Math.sin(phase) * (front ? 0.75 : 0.45);
            pz = side * (front ? 1.25 : 0.9);
          } else {
            // The panda doggy-paddles: arms churn in alternating circles.
            const phase = paddlePhase + (side > 0 ? Math.PI : 0) + (front ? 0 : Math.PI / 2);
            px = (front ? -1.3 : -0.4) + Math.sin(phase) * (front ? 0.8 : 0.5);
            py = 0;
            pz = rest.z;
          }
          x = lerp(x, px, paddle);
          y = lerp(y, py, paddle);
          z = lerp(z, pz, paddle);
        }
        poseLimb(l, x, y, z, dt, 14);
      }
    }

    // The body eases back to standing after any activity that posed it.
    if (!POSED.has(state.name)) {
      easeTo(rig.body.position, 'x', 0, dt, 10);
      easeTo(rig.body.position, 'z', 0, dt, 10);
      easeTo(rig.body.position, 'y', rig.lift, dt, 10);
      for (const axis of ['x', 'y', 'z']) easeTo(rig.body.rotation, axis, 0, dt, 8);
    }
    for (const axis of ['x', 'y', 'z']) easeTo(rig.body.scale, axis, 1, dt, 10);

    // Lean into turns and with changes of speed; springs give the overshoot.
    const turnRate = wrap(heading - lastHeading) / Math.max(dt, 1e-3);
    lastHeading = heading;
    const accel = (speed - lastSpeed) / Math.max(dt, 1e-3);
    lastSpeed = speed;
    roll.target = clamp(-turnRate * speed * 0.7, -0.16, 0.16);
    pitch.target = clamp(accel * 0.12, -0.1, 0.1);
    roll.update(dt);
    pitch.update(dt);
    squash.update(dt);
    const waddle = !isTurtle ? Math.sin(gait) * 0.07 * pace : Math.sin(gait * 2) * 0.02 * pace;
    rig.pose.rotation.z = roll.value + waddle;
    rig.pose.rotation.x = pitch.value;

    // Breathing that drifts in rate and depth, slower and deeper when asleep.
    const sleepy = SLEEPY.has(state.name) || (state.name === 'bask' && state.t > 1);
    breathPhase += dt * (sleepy ? 1.0 : 2.1) * (1 + 0.2 * Math.sin(t * 0.31));
    const breath = (Math.sin(breathPhase) + 0.3 * Math.sin(breathPhase * 2.3 + 1)) / 1.3;
    const sy = squash.value * (1 + breath * (sleepy ? 0.03 : 0.015));
    rig.pose.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    rig.pose.position.y = Math.abs(Math.sin(gait)) * (isTurtle ? 0.012 : 0.028) * pace;
  }

  // ── public API ──────────────────────────────────────────────────
  const busy = () => ['held', 'fall', 'gift', 'special', 'charge', 'enter'].includes(state.name);
  const inWater = () => IN_WATER.has(state.name);

  return {
    get state() {
      return state.name;
    },
    update(dt, t, pointerTarget) {
      state.t += dt;
      paddleWant = 0;
      (states[state.name] ?? states.idle)(dt, t);
      animateBody(dt, t);
      const target = state.name === 'gift' ? look.target : pointerTarget;
      const asleep = ['nap', 'sleep', 'focus', 'meditate'].includes(state.name) || (state.name === 'bask' && state.t > 1);
      rig.lookAt(asleep ? null : target, dt, look.strength);
      rig.update(dt, t);
    },
    setNight(v) {
      night = v;
    },
    setCalm(v) {
      calm = v;
    },
    setMode(next) {
      mode = next;
      if (next === 'focus') {
        if (inWater()) bankNow();
        pos.y = 0;
        go(v3(0, 0, 0.5), 'focus');
      } else if (state.name === 'focus') to('idle', {}, 1);
    },
    pet() {
      if (busy()) return;
      const now = performance.now();
      clicks = clicks.filter((c) => now - c < 2500);
      clicks.push(now);
      const at = headWorld().add(v3(0, 0.15, 0));
      if (inWater()) {
        // Swimming: a happy wiggle and hearts, without leaving the water.
        effects.spawn('heart', at, { count: 3, spread: 0.3, size: 0.1 });
        squash.kick(-2);
        onEvent({ type: 'pet' });
        return;
      }
      if (clicks.length >= 5) {
        clicks = [];
        to('dizzy', {}, 2.2);
        onEvent({ type: 'dizzy' });
        return;
      }
      if (state.name === 'nap' || state.name === 'sleep') {
        to('wake', {}, 0.9);
        effects.spawn('swirl', at, { size: 0.08 });
        onEvent({ type: 'woken' });
        return;
      }
      effects.spawn(stage === 4 ? 'leaf' : 'heart', at, { count: 3, spread: 0.3, size: 0.1 });
      squash.kick(-2.5);
      to('pet', {}, 1);
      onEvent({ type: 'pet' });
    },
    grab(point) {
      if (state.name === 'gift') return false;
      pos.y = Math.max(pos.y, 0.05);
      to('held', { target: point.clone() });
      onEvent({ type: 'grabbed' });
      return true;
    },
    drag(point) {
      if (state.name !== 'held') return;
      A.clampToPlinth(point);
      state.data.target.copy(point);
    },
    drop() {
      if (state.name !== 'held') return;
      rig.tuck(0);
      const water = A.inWater(pos.x, pos.z);
      to('fall', { vy: 0, floor: water ? floatY(water) : 0 });
    },
    holdStart() {
      if (busy() || inWater()) return;
      to('charge', {});
      onEvent({ type: 'charging' });
    },
    holdEnd() {
      if (state.name === 'charge') {
        squash.target = 1;
        rig.body.position.x = 0;
        to('pet', {}, 1); // let go early: a giggle instead of the special move
      }
    },
    /** Gives a treat. Resolves once the companion has eaten it and reacted. */
    gift(treatId) {
      if (pendingGift) return pendingGift;
      if (state.name === 'held') this.drop();
      if (inWater() || state.name === 'fall') bankNow();
      pos.y = 0;
      rig.tuck(0);
      const treat = buildTreat(treatId);
      const size = stage === 1 ? 1.6 : 1.9 + (stage - 2) * 0.25;
      treat.scale.setScalar(size);
      scene.add(treat);
      const from = headWorld().add(v3(0, 1.1, 0.2));
      treat.position.copy(from);
      pendingGift = new Promise((resolve) => {
        to('gift', { treat, treatId, size, from, react: stage === 4 ? 1.6 : 1.4, resolve: () => resolve() });
      }).finally(() => {
        pendingGift = null;
      });
      return pendingGift;
    },
    celebrate() {
      if (busy()) return;
      effects.spawn('sparkle', headWorld().add(v3(0, 0.2, 0)), { count: 6, spread: 0.6, size: 0.09 });
      if (inWater()) return;
      to('celebrate', {}, 1.4);
    },
    /** "Come here": walk to a clicked spot on open ground, around ponds and stones. */
    comeTo(point) {
      if (busy() || mode === 'focus') return false;
      if (!A.isOpen(point.x, point.z, rig.radius * 0.5)) return false;
      if (inWater()) {
        const w = pondNow();
        if (!w) return false;
        to('exitWater', { pond: w, toward: point.clone(), then: { name: 'walk', data: { target: point.clone() } } });
        return true;
      }
      if (state.name === 'nap' || state.name === 'sleep') rig.tuck(0);
      pos.y = 0;
      const via = detour(point);
      to('walk', via ? { target: via, next: point.clone() } : { target: point.clone() });
      return true;
    },
  };
}
