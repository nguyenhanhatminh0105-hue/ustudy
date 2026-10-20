import * as THREE from 'three';
import { createEngine } from './engine.js';
import { buildWorld } from './worlds.js';
import { buildCharacter } from './characters.js';
import { createBehaviour } from './behaviour.js';
import { createEffects } from './effects.js';
import { disposeTree } from './materials.js';

const STAGE_INDEX = { baby: 1, child: 2, teen: 3, adult: 4 };
const HOLD_MS = 450;
const DRAG_PX = 6;

export const isNightNow = (d = new Date()) => d.getHours() >= 19 || d.getHours() < 6;

/**
 * Renders one still frame of a companion's garden at a life stage and
 * returns it as a PNG data URL (for the growth-journey thumbnails), without
 * keeping a WebGL context alive.
 */
export function snapshotGarden({ companion, stage, width = 320, height = 220, night = false }) {
  const holder = document.createElement('div');
  Object.assign(holder.style, { position: 'fixed', left: '-10000px', top: '0', width: `${width}px`, height: `${height}px` });
  document.body.append(holder);
  const engine = createEngine(holder, { night, pixelRatioCap: 2 });
  engine.stop();
  const world = buildWorld(companion, STAGE_INDEX[stage] ?? stage, { night, seed: 7 });
  engine.scene.add(world.group);
  const rig = buildCharacter(companion, STAGE_INDEX[stage] ?? stage);
  rig.root.position.set(0.15, 0, 0.7);
  rig.root.rotation.y = 0.45;
  rig.setExpression('happy');
  engine.scene.add(rig.root);
  engine.focus.set(0.1, 0.35, 0.35);
  engine.frame(world.radius * 0.72);
  engine.renderOnce();
  const url = engine.renderer.domElement.toDataURL('image/png');
  engine.dispose();
  disposeTree(engine.scene);
  holder.remove();
  return url;
}

/**
 * Mounts an interactive 3D garden with the companion in it.
 *
 *   const garden = mountGarden(el, { companion: 'turtle', stage: 'teen' });
 *   await garden.gift('cake');
 *   garden.setMode('focus');
 *   garden.grow('adult');
 */
export function mountGarden(container, options = {}) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const settings = {
    companion: options.companion ?? 'turtle',
    stage: STAGE_INDEX[options.stage] ?? options.stage ?? 1,
    interactive: options.interactive ?? true,
    night: options.night ?? 'auto',
    onEvent: options.onEvent ?? (() => {}),
    seed: options.seed ?? 7,
  };
  const night = () => (settings.night === 'auto' ? isNightNow() : Boolean(settings.night));

  const engine = createEngine(container, { night: night(), pixelRatioCap: options.pixelRatioCap ?? 2 });
  const effects = createEffects(engine.scene);
  let world;
  let rig;
  let behaviour;
  let calm = prefersReduced.matches;

  function build() {
    if (world) {
      engine.scene.remove(world.group);
      disposeTree(world.group);
    }
    if (rig) {
      engine.scene.remove(rig.root);
      disposeTree(rig.root);
    }
    world = buildWorld(settings.companion, settings.stage, { night: night(), seed: settings.seed });
    engine.scene.add(world.group);
    rig = buildCharacter(settings.companion, settings.stage);
    engine.scene.add(rig.root);
    behaviour = createBehaviour({
      rig,
      world,
      effects,
      scene: engine.scene,
      night: night(),
      calm,
      onEvent: settings.onEvent,
    });
    engine.frame(world.radius);
    engine.setNight(night());
  }
  build();

  // ── pointer: eyes, click, drag, hold ────────────────────────────
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let pointerInside = false;
  const pointerWorld = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  let press = null;

  const canvas = engine.renderer.domElement;
  const setRay = (e) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, engine.camera);
  };
  const hitsCompanion = () => raycaster.intersectObject(rig.root, true).length > 0;
  const groundPoint = () => raycaster.ray.intersectPlane(ground, new THREE.Vector3());

  function onMove(e) {
    pointerInside = true;
    setRay(e);
    // The eyes follow a point on the cursor ray, at the companion's distance from the camera.
    const d = engine.camera.position.distanceTo(rig.head.getWorldPosition(new THREE.Vector3()));
    raycaster.ray.at(d * 0.9, pointerWorld);
    if (!settings.interactive) return;
    if (press) {
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (!press.dragging && press.onCompanion && moved > DRAG_PX) {
        clearTimeout(press.holdTimer);
        if (press.holding) behaviour.holdEnd();
        const p = groundPoint();
        if (p && behaviour.grab(p)) press.dragging = true;
      }
      if (press.dragging) {
        const p = groundPoint();
        if (p) behaviour.drag(p);
      }
    } else {
      canvas.style.cursor = hitsCompanion() ? 'grab' : 'default';
    }
  }

  function onDown(e) {
    if (!settings.interactive || e.button > 0) return;
    setRay(e);
    canvas.setPointerCapture(e.pointerId);
    const onCompanion = hitsCompanion();
    press = { x: e.clientX, y: e.clientY, at: performance.now(), onCompanion, dragging: false, holding: false };
    if (onCompanion) {
      canvas.style.cursor = 'grabbing';
      press.holdTimer = setTimeout(() => {
        if (press && !press.dragging) {
          press.holding = true;
          behaviour.holdStart();
        }
      }, HOLD_MS);
    }
  }

  function onUp(e) {
    if (!press) return;
    clearTimeout(press.holdTimer);
    setRay(e);
    if (press.dragging) behaviour.drop();
    else if (press.holding) behaviour.holdEnd();
    else if (press.onCompanion) behaviour.pet();
    else {
      // Clicking the garden: ripple the water, or call the companion over.
      const p = groundPoint();
      if (p) {
        const water = world.affordances.inWater(p.x, p.z);
        if (water) {
          water.pond.userData.ripple(p.x - water.x, p.z - water.z, 0.8);
          for (const fish of world.affordances.koi) fish.userData.feed(p.x - water.x, p.z - water.z, 2.5);
        } else if (behaviour.comeTo(p)) {
          settings.onEvent({ type: 'called' });
        }
      }
    }
    canvas.style.cursor = 'default';
    press = null;
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', () => {
    pointerInside = false;
  });
  // Eyes keep following the cursor anywhere on the page, not just over the canvas.
  const onWindowMove = (e) => {
    if (e.target === canvas) return;
    setRay(e);
    const d = engine.camera.position.distanceTo(rig.head.getWorldPosition(new THREE.Vector3()));
    raycaster.ray.at(d * 0.9, pointerWorld);
    pointerInside = true;
  };
  window.addEventListener('pointermove', onWindowMove, { passive: true });

  // Keyboard: the garden wrapper is focusable; Enter or Space pets the companion.
  const onKey = (e) => {
    if (!settings.interactive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      behaviour.pet();
    }
  };
  container.addEventListener('keydown', onKey);

  const onMotionPref = () => {
    calm = prefersReduced.matches;
    behaviour.setCalm(calm);
  };
  prefersReduced.addEventListener('change', onMotionPref);

  // ── frame loop ──────────────────────────────────────────────────
  engine.add((dt, t) => {
    world.update(dt, t, calm);
    lookTarget.copy(pointerWorld);
    behaviour.update(dt, t, pointerInside ? lookTarget : engine.camera.position);
    effects.update(dt);
  });

  return {
    get companion() {
      return settings.companion;
    },
    get stage() {
      return settings.stage;
    },
    /** Where the companion's head is on screen (client px), e.g. to anchor a speech bubble. */
    companionScreenPosition() {
      const p = rig.head.getWorldPosition(new THREE.Vector3()).project(engine.camera);
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    },
    get activity() {
      return behaviour.state;
    },
    gift: (treat) => behaviour.gift(treat),
    celebrate: () => behaviour.celebrate(),
    pet: () => behaviour.pet(),
    setMode: (mode) => behaviour.setMode(mode),
    setNight(v) {
      settings.night = v;
      build();
    },
    /** Rebuilds the garden for a new life stage with a little burst of leaves. */
    grow(stage) {
      settings.stage = STAGE_INDEX[stage] ?? stage;
      build();
      const head = rig.head.getWorldPosition(new THREE.Vector3());
      effects.spawn('leaf', head, { count: 10, spread: 1.2, size: 0.09, rise: 0.8, life: 2 });
      effects.spawn('sparkle', head, { count: 8, spread: 1, size: 0.1 });
    },
    setCompanion(companion) {
      settings.companion = companion;
      build();
    },
    destroy() {
      window.removeEventListener('pointermove', onWindowMove);
      prefersReduced.removeEventListener('change', onMotionPref);
      container.removeEventListener('keydown', onKey);
      engine.dispose();
      disposeTree(engine.scene);
    },
  };
}
