import * as THREE from 'three';
import { buildTreat } from './treats.js';

const TAU = Math.PI * 2;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * What the companion does, moment to moment. Ambient activities depend on
 * the companion, its life stage and what its garden offers; interactions
 * (pet, drag, hold, gift) interrupt them and then hand control back.
 */
export function createBehaviour({ rig, world, effects, scene, night = false, calm = false, onEvent = () => {} }) {
  const A = world.affordances;
  const pos = rig.root.position;
  const isTurtle = rig.companion === 'turtle';
  const stage = rig.stage;
  const walkSpeed = (isTurtle ? 0.22 : 0.3) * (0.7 + stage * 0.12);

  let state = { name: 'idle', t: 0, dur: 2, data: {} };
  let heading = 0.25;
  let gait = 0;
  let blinkIn = 2;
  let blink = 0;
  let clicks = [];
  let mode = 'free'; // 'free' | 'focus'
  const look = { target: null, strength: 1 };
  let pendingGift = null;

  pos.set(0, 0, 0.6);
  rig.root.rotation.y = heading;

  // ── helpers ─────────────────────────────────────────────────────
  const to = (name, data = {}, dur = Infinity) => {
    exit(state);
    state = { name, t: 0, dur, data };
    onEvent({ type: 'state', name });
  };
  const exit = (s) => {
    if (s.name === 'eat' && rig.snack) rig.snack.visible = stage === 2;
    if (s.name === 'special' || s.name === 'hide') rig.tuck(0);
    rig.body.rotation.set(0, 0, 0);
    rig.body.position.x = 0;
    rig.body.position.z = 0;
  };
  const headWorld = () => rig.head.getWorldPosition(v3());

  function face(target, dt, rate = 6) {
    const want = angleTo(pos, target);
    heading += wrap(want - heading) * Math.min(1, dt * rate);
    rig.root.rotation.y = heading;
  }

  /** Walks toward a point; returns true on arrival. */
  function walk(target, dt, speed = walkSpeed) {
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    face(target, dt);
    const facing = Math.cos(wrap(angleTo(pos, target) - heading));
    const step = Math.min(d, speed * dt * Math.max(0.15, facing));
    pos.x += (dx / d) * step;
    pos.z += (dz / d) * step;
    gait += dt * speed * 28;
    return false;
  }

  const segmentClear = (from, target) => {
    for (let i = 1; i <= 12; i += 1) {
      const k = i / 12;
      const x = from.x + (target.x - from.x) * k;
      const z = from.z + (target.z - from.z) * k;
      if (A.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + rig.radius * 0.6)) return false;
      if (Math.hypot(x, z) > A.radius - 0.35) return false;
    }
    return true;
  };

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

  /** Chooses the next ambient activity, weighted by what this garden offers. */
  function nextActivity() {
    if (calm || mode === 'focus') return to('idle', {}, 4);
    if (night && Math.random() < 0.55) {
      const spot = A.napSpots[0] ?? (isTurtle ? A.baskStones[0] : null);
      return to('approach', { target: spot ? v3(spot.x, 0, spot.z + 0.25) : pos.clone(), then: 'sleep' });
    }
    const options = [['wander', 3], ['idle', 2]];
    if (isTurtle) {
      if (A.water.length) options.push(['swim', 2.4]);
      if (A.baskStones.length) options.push(['bask', 1.8]);
      if (A.koi.length && stage >= 3) options.push(['koi', 1.6]);
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
        const a = angleTo(w, pos);
        const edge = v3(w.x + Math.sin(a) * (w.r + 0.15), 0, w.z + Math.cos(a) * (w.r + 0.15));
        return to('approach', { target: edge, then: 'swim', pond: w });
      }
      case 'bask': {
        const s = pick(A.baskStones);
        return to('approach', { target: v3(s.x, 0, s.z + s.r + 0.12), then: 'bask', stone: s });
      }
      case 'koi': {
        const w = A.water[0];
        const a = angleTo(w, v3(0, 0, A.radius));
        return to('approach', { target: v3(w.x + Math.sin(a) * (w.r + 0.2), 0, w.z + Math.cos(a) * (w.r + 0.2)), then: 'koi', pond: w });
      }
      case 'nap': {
        const spot = A.napSpots.length ? pick(A.napSpots) : null;
        const target = spot ? v3(spot.x, 0, spot.z) : randomOpenPoint(pos, 0.8) ?? pos.clone();
        return to('approach', { target, then: 'nap' });
      }
      case 'eat':
      case 'climb': {
        const tall = name === 'climb' ? A.bamboo.filter((b) => b.h > 1.2) : A.bamboo;
        const b = pick(tall);
        const a = angleTo(b, v3(0, 0, A.radius));
        const spot = v3(b.x + Math.sin(a) * 0.3, 0, b.z + Math.cos(a) * 0.3);
        return to('approach', { target: spot, then: name, bamboo: b });
      }
      case 'meditate':
        return to('approach', { target: v3(A.seat.x, 0, A.seat.z + 0.05), then: 'meditate' });
      case 'roll':
        return to('roll', {}, 1.6);
      case 'paddle': {
        const w = pick(A.water);
        const a = angleTo(w, pos);
        return to('approach', { target: v3(w.x + Math.sin(a) * (w.r + 0.12), 0, w.z + Math.cos(a) * (w.r + 0.12)), then: 'paddle', pond: w });
      }
      default:
        return to('idle', {}, 2 + Math.random() * 2);
    }
  }

  // ── per-state frame logic ───────────────────────────────────────
  const states = {
    idle(dt) {
      rig.setExpression(blink > 0 ? 'blink' : 'neutral');
      if (state.t > state.dur) nextActivity();
    },
    walk(dt) {
      rig.setExpression(blink > 0 ? 'blink' : 'neutral');
      if (walk(state.data.target, dt) || state.t > 12) to('idle', {}, 1 + Math.random() * 2);
    },
    approach(dt) {
      rig.setExpression(blink > 0 ? 'blink' : 'neutral');
      const { target, then, ...rest } = state.data;
      if (walk(target, dt) || state.t > 14) to(then, rest, stateDuration(then));
    },
    swim(dt, t) {
      const w = state.data.pond;
      if (!state.data.angle) state.data.angle = angleTo(w, pos);
      state.data.angle += dt * 0.35;
      const r = w.r * 0.55;
      const target = v3(w.x + Math.sin(state.data.angle) * r, 0, w.z + Math.cos(state.data.angle) * r);
      const k = Math.min(1, state.t / 0.8);
      pos.x += (target.x - pos.x) * Math.min(1, dt * 2);
      pos.z += (target.z - pos.z) * Math.min(1, dt * 2);
      face(target, dt, 3);
      pos.y = -0.05 * rig.lift * 4 * k;
      gait += dt * 6;
      rig.setExpression('happy');
      if (Math.random() < dt * 1.2) w.pond.userData.ripple(pos.x - w.x, pos.z - w.z, 0.4);
      if (state.t > state.dur) leaveWater(w);
    },
    bask(dt) {
      const s = state.data.stone;
      const k = ease(state.t / 0.6);
      pos.x += (s.x - pos.x) * k * dt * 4;
      pos.z += (s.z - pos.z) * k * dt * 4;
      pos.y = s.top * k;
      rig.setExpression(state.t > 1 ? 'calm' : 'happy');
      rig.body.rotation.x = -0.08;
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
    nap(dt, t) {
      rig.setExpression('sleep');
      const k = ease(state.t / 0.8);
      if (isTurtle) rig.tuck(0.35 * k);
      else rig.body.rotation.z = 1.35 * k;
      if (!isTurtle) rig.body.position.y = rig.lift - rig.lift * 0.85 * k;
      if (Math.random() < dt * 0.9) effects.spawn('z', headWorld().add(v3(0.1, 0.18, 0)), { size: 0.1, rise: 0.35, life: 1.8 });
      if (state.t > state.dur) wake();
    },
    sleep(dt) {
      states.nap(dt);
      if (!night && state.t > 4) wake();
    },
    eat(dt, t) {
      const b = state.data.bamboo;
      face(v3(b.x, 0, b.z), dt);
      if (rig.snack) rig.snack.visible = true;
      // Sit, raise the stick, chew.
      rig.body.position.y = rig.lift * 0.55;
      rig.limbs.fr.rotation.x = -1.6 + Math.sin(t * 6) * 0.15;
      rig.setExpression(Math.sin(t * 8) > 0 ? 'eat' : 'happy');
      if (Math.random() < dt * 1.5) effects.spawn('leaf', headWorld().add(v3(0, -0.05, 0.15)), { size: 0.05, rise: -0.1, gravity: 0.8 });
      if (state.t > state.dur) {
        rig.body.position.y = rig.lift;
        rig.limbs.fr.rotation.x = -0.5;
        to('idle', {}, 1);
      }
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
      rig.limbs.fl.rotation.x = -2.4 + Math.sin(t * 9) * (phase < 2.6 || phase > 5.5 ? 0.4 : 0.05);
      rig.limbs.fr.rotation.x = -2.4 - Math.sin(t * 9) * (phase < 2.6 || phase > 5.5 ? 0.4 : 0.05);
      // at the top, turn the head to the viewer
      look.strength = phase > 2.6 && phase < 5.5 ? 1 : 0.3;
      rig.setExpression(phase > 2.6 && phase < 5.5 ? 'happy' : 'neutral');
      if (phase > 7.1) {
        pos.y = 0;
        rig.limbs.fl.rotation.x = -0.5;
        rig.limbs.fr.rotation.x = -0.5;
        look.strength = 1;
        to('walk', { target: randomOpenPoint(pos, 1) ?? pos.clone() });
      }
    },
    meditate(dt, t) {
      face(v3(0, 0, A.radius * 2), dt, 2);
      const k = ease(state.t / 1);
      pos.y = A.seat.y * k;
      rig.body.position.y = rig.lift * (1 - 0.5 * k);
      rig.setExpression('calm');
      rig.limbs.fl.rotation.x = -0.9;
      rig.limbs.fr.rotation.x = -0.9;
      rig.body.scale.y = 1 + Math.sin(t * 0.9) * 0.025; // slow breath
      if (Math.random() < dt * 0.4) effects.spawn('leaf', headWorld().add(v3((Math.random() - 0.5) * 0.6, 0.5, 0)), { size: 0.05, rise: -0.15, life: 2.4 });
      if (state.t > state.dur) {
        pos.y = 0;
        rig.body.position.y = rig.lift;
        to('walk', { target: randomOpenPoint(pos, 1.2) ?? pos.clone() });
      }
    },
    roll(dt) {
      const k = state.t / state.dur;
      rig.body.rotation.z = TAU * ease(k);
      rig.body.position.y = rig.lift + Math.sin(k * Math.PI) * 0.15;
      rig.setExpression('happy');
      if (k >= 1) to('idle', {}, 1);
    },
    paddle(dt) {
      const w = state.data.pond;
      face(v3(w.x, 0, w.z), dt);
      rig.limbs.fl.rotation.x = -1.2 + Math.sin(state.t * 10) * 0.5;
      rig.setExpression(Math.sin(state.t * 3) > 0 ? 'happy' : 'surprised');
      if (Math.random() < dt * 3) {
        const local = { x: pos.x - w.x, z: pos.z - w.z };
        w.pond.userData.ripple(local.x * 0.85, local.z * 0.85, 0.4);
        effects.spawn('drop', headWorld().add(v3(0, -0.1, 0.2)), { size: 0.05, gravity: 2.5, velocity: v3(0, 1, 0.3) });
      }
      if (state.t > state.dur) {
        rig.limbs.fl.rotation.x = -0.5;
        to('idle', {}, 1);
      }
    },

    // ── interaction states ──
    pet(dt) {
      const k = state.t / 0.55;
      rig.body.position.y = rig.lift + Math.sin(Math.min(1, k) * Math.PI) * 0.12;
      const squash = k < 1 ? 1 + Math.sin(k * Math.PI * 2) * 0.08 : 1;
      rig.body.scale.set(1 / squash, squash, 1 / squash);
      rig.setExpression('happy');
      if (k >= 1.6) to('idle', {}, 1.2);
    },
    dizzy(dt, t) {
      rig.setExpression('dizzy');
      rig.body.rotation.z = Math.sin(t * 6) * 0.15;
      if (Math.random() < dt * 3) effects.spawn('swirl', headWorld().add(v3(0, 0.15, 0)), { size: 0.09, rise: 0.15 });
      if (state.t > 2.2) to('idle', {}, 1);
    },
    held(dt, t) {
      const target = state.data.target;
      pos.x += (target.x - pos.x) * Math.min(1, dt * 14);
      pos.z += (target.z - pos.z) * Math.min(1, dt * 14);
      pos.y += (0.55 + Math.sin(t * 5) * 0.03 - pos.y) * Math.min(1, dt * 10);
      // dangle: limbs kick, body sways against the motion
      for (const [i, l] of Object.values(rig.limbs).entries()) l.rotation.x = Math.sin(t * 14 + i * 1.7) * 0.6 - (rig.companion === 'panda' && i < 2 ? 0.5 : 0);
      rig.body.rotation.z = THREE.MathUtils.clamp((target.x - pos.x) * -2, -0.5, 0.5);
      rig.setExpression(state.t < 0.6 ? 'surprised' : 'happy');
      if (isTurtle && state.t < 0.4) rig.tuck(0.5 - state.t);
    },
    fall(dt) {
      state.data.vy -= 9.8 * dt;
      pos.y += state.data.vy * dt;
      if (pos.y <= state.data.floor) {
        pos.y = state.data.floor;
        land(state.data.landing);
      }
    },
    land(dt) {
      const k = state.t / 0.45;
      const squash = 1 - Math.sin(Math.min(1, k) * Math.PI) * 0.25;
      rig.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      rig.setExpression(k < 0.5 ? 'surprised' : 'happy');
      if (k >= 1) {
        rig.body.scale.set(1, 1, 1);
        const after = state.data.after;
        if (after) to(after.name, after.data, after.dur);
        else to('idle', {}, 1.2);
      }
    },
    shake(dt, t) {
      // panda after a splash: shake the water off
      rig.body.rotation.y = Math.sin(t * 30) * 0.35 * (1 - state.t / 1.2);
      rig.setExpression('surprised');
      if (Math.random() < dt * 12) effects.spawn('drop', headWorld(), { size: 0.045, gravity: 3, velocity: v3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2) });
      if (state.t > 1.2) {
        const out = randomOpenPoint(pos, 1.2) ?? v3(0, 0, A.radius * 0.5);
        to('walk', { target: out });
      }
    },
    charge(dt, t) {
      const k = Math.min(1, state.t / 0.85);
      rig.body.position.x = Math.sin(t * 60) * 0.012 * k;
      rig.body.scale.set(1 + k * 0.06, 1 - k * 0.08, 1 + k * 0.06);
      rig.setExpression('surprised');
      if (Math.random() < dt * 8 * k) effects.spawn('sparkle', pos.clone().add(v3((Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.6)), { size: 0.06, rise: 0.5, life: 0.6 });
      if (state.t >= 0.85) to('special', {}, isTurtle ? 1.8 : 1.4);
    },
    special(dt) {
      const k = state.t / state.dur;
      rig.body.scale.set(1, 1, 1);
      rig.body.position.x = 0;
      if (isTurtle) {
        // hide in the shell and spin like a top, then pop back out
        rig.tuck(k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2);
        rig.body.rotation.y = TAU * 3 * ease(Math.min(1, k / 0.8));
        rig.setExpression(k < 0.8 ? 'sleep' : 'happy');
      } else {
        // a forward somersault
        rig.body.rotation.x = TAU * ease(k);
        rig.body.position.y = rig.lift + Math.sin(k * Math.PI) * 0.35;
        rig.setExpression('happy');
      }
      if (k >= 1) {
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
        // three chomps
        const chomp = Math.floor((state.t - 1.0) / 0.5);
        const s = Math.max(0.05, 1 - chomp * 0.33);
        d.treat.scale.setScalar(s);
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
          rig.body.rotation.y = TAU * ease(k);
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
    celebrate(dt) {
      const k = state.t / state.dur;
      rig.body.position.y = rig.lift + Math.abs(Math.sin(k * Math.PI * 3)) * 0.14;
      rig.setExpression('happy');
      if (k >= 1) to('idle', {}, 1);
    },
    focus(dt, t) {
      // During a focus session: settle down, breathe slowly, eyes closed.
      rig.setExpression('calm');
      rig.body.scale.y = 1 + Math.sin(t * 0.8) * 0.02;
      if (!isTurtle) rig.body.position.y = rig.lift * 0.6;
    },
  };

  function stateDuration(name) {
    return {
      swim: 6 + Math.random() * 5,
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

  function leaveWater(w) {
    pos.y = 0;
    const a = angleTo(w, pos);
    to('walk', { target: v3(w.x + Math.sin(a) * (w.r + 0.25), 0, w.z + Math.cos(a) * (w.r + 0.25)) });
  }

  function wake() {
    rig.tuck(0);
    rig.body.rotation.z = 0;
    rig.body.position.y = rig.lift;
    rig.setExpression('neutral');
    effects.spawn('sparkle', headWorld(), { size: 0.06, rise: 0.3 });
    to('idle', {}, 1.5);
  }

  function land(where) {
    const water = A.inWater(pos.x, pos.z);
    if (water) {
      water.pond.userData.ripple(pos.x - water.x, pos.z - water.z, 1.4);
      effects.spawn('drop', pos.clone().add(v3(0, 0.1, 0)), { count: 7, size: 0.05, gravity: 3, velocity: v3(0, 1.6, 0) });
      if (isTurtle) {
        onEvent({ type: 'splash', happy: true });
        return to('land', { after: { name: 'swim', data: { pond: water }, dur: 6 } });
      }
      onEvent({ type: 'splash', happy: false });
      pos.y = 0;
      return to('land', { after: { name: 'shake', data: {}, dur: 1.2 } });
    }
    const stone = A.baskStones.find((s) => Math.hypot(pos.x - s.x, pos.z - s.z) < s.r + 0.1);
    if (stone && isTurtle) return to('land', { after: { name: 'bask', data: { stone }, dur: 5 } });
    const stalk = A.bamboo.find((b) => Math.hypot(pos.x - b.x, pos.z - b.z) < 0.45);
    if (stalk && !isTurtle && stage >= 2) {
      return to('land', { after: { name: stalk.h > 1.2 && stage >= 3 ? 'climb' : 'eat', data: { bamboo: stalk }, dur: stalk.h > 1.2 && stage >= 3 ? 7.2 : 4 } });
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
  function animateBody(dt, t) {
    const moving = ['walk', 'approach', 'swim'].includes(state.name);
    const swing = moving ? Math.sin(gait) * (isTurtle ? 0.55 : 0.45) : 0;
    if (!['held', 'eat', 'climb', 'meditate', 'paddle'].includes(state.name)) {
      rig.limbs.fl.rotation.x += ((rig.companion === 'panda' ? -0.5 : 0) + swing - rig.limbs.fl.rotation.x) * Math.min(1, dt * 12);
      rig.limbs.fr.rotation.x += ((rig.companion === 'panda' ? -0.5 : 0) - swing - rig.limbs.fr.rotation.x) * Math.min(1, dt * 12);
      rig.limbs.bl.rotation.x += (-swing - rig.limbs.bl.rotation.x) * Math.min(1, dt * 12);
      rig.limbs.br.rotation.x += (swing - rig.limbs.br.rotation.x) * Math.min(1, dt * 12);
    }
    if (!['pet', 'land', 'charge', 'roll', 'special', 'gift', 'celebrate', 'nap', 'sleep', 'eat', 'meditate', 'focus'].includes(state.name)) {
      const breath = 1 + Math.sin(t * 2.2) * 0.018;
      rig.body.scale.set(1, breath, 1);
      rig.body.position.y = rig.lift + (moving ? Math.abs(Math.sin(gait)) * 0.025 : 0);
    }
    if (moving && !isTurtle) rig.body.rotation.z = Math.sin(gait) * 0.08; // panda waddle
    // blinking
    blinkIn -= dt;
    if (blinkIn <= 0) {
      blink = 0.12;
      blinkIn = 2.5 + Math.random() * 3.5;
    }
    blink = Math.max(0, blink - dt);
  }

  // ── public API ──────────────────────────────────────────────────
  const busy = () => ['held', 'fall', 'gift', 'special', 'charge'].includes(state.name);

  return {
    get state() {
      return state.name;
    },
    update(dt, t, pointerTarget) {
      state.t += dt;
      (states[state.name] ?? states.idle)(dt, t);
      animateBody(dt, t);
      const target = state.name === 'gift' ? look.target : pointerTarget;
      const asleep = ['nap', 'sleep', 'focus', 'meditate'].includes(state.name) || (state.name === 'bask' && state.t > 1);
      rig.lookAt(asleep ? null : target, dt, look.strength);
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
        pos.y = 0;
        to('approach', { target: v3(0, 0, 0.5), then: 'focus' });
      } else if (state.name === 'focus') to('idle', {}, 1);
    },
    pet() {
      if (busy()) return;
      const now = performance.now();
      clicks = clicks.filter((c) => now - c < 2500);
      clicks.push(now);
      const at = headWorld().add(v3(0, 0.15, 0));
      if (clicks.length >= 5) {
        clicks = [];
        to('dizzy', {}, 2.2);
        onEvent({ type: 'dizzy' });
        return;
      }
      if (state.name === 'nap' || state.name === 'sleep') {
        wake();
        effects.spawn('swirl', at, { size: 0.08 });
        onEvent({ type: 'woken' });
        return;
      }
      effects.spawn(stage === 4 ? 'leaf' : 'heart', at, { count: 3, spread: 0.3, size: 0.1 });
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
      for (const l of Object.values(rig.limbs)) l.rotation.x = rig.companion === 'panda' ? -0.5 : 0;
      rig.body.rotation.z = 0;
      to('fall', { vy: 0, floor: 0 });
    },
    holdStart() {
      if (busy()) return;
      to('charge', {});
      onEvent({ type: 'charging' });
    },
    holdEnd() {
      if (state.name === 'charge') {
        rig.body.scale.set(1, 1, 1);
        rig.body.position.x = 0;
        to('pet', {}, 1); // let go early: a giggle instead of the special move
      }
    },
    /** Gives a treat. Resolves once the companion has eaten it and reacted. */
    gift(treatId) {
      if (pendingGift) return pendingGift;
      if (state.name === 'held') this.drop();
      pos.y = 0;
      rig.tuck(0);
      const treat = buildTreat(treatId);
      treat.scale.setScalar(stage === 1 ? 1.6 : 1.9 + (stage - 2) * 0.25);
      scene.add(treat);
      const from = headWorld().add(v3(0, 1.1, 0.2));
      treat.position.copy(from);
      pendingGift = new Promise((resolve) => {
        to('gift', { treat, treatId, from, react: stage === 4 ? 1.6 : 1.4, resolve: () => resolve() });
      }).finally(() => {
        pendingGift = null;
      });
      return pendingGift;
    },
    celebrate() {
      if (busy()) return;
      effects.spawn('sparkle', headWorld().add(v3(0, 0.2, 0)), { count: 6, spread: 0.6, size: 0.09 });
      to('celebrate', {}, 1.4);
    },
    /** "Come here": walk to a clicked spot on open ground. */
    comeTo(point) {
      if (busy() || mode === 'focus') return false;
      if (state.name === 'nap' || state.name === 'sleep') wake();
      if (A.isOpen(point.x, point.z, rig.radius * 0.5)) {
        pos.y = 0;
        to('walk', { target: point.clone() });
        return true;
      }
      return false;
    },
  };
}
