import * as THREE from 'three';
import { PALETTE } from './materials.js';

/**
 * Renderer, camera, light and frame loop for one garden diorama.
 * The canvas is transparent: the page's own background shows around the plinth.
 */
export function createEngine(container, { night = false, pixelRatioCap = 2 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const focus = new THREE.Vector3(0, 0.35, 0);

  const hemi = new THREE.HemisphereLight(0xf3f6f0, 0x5d6b5a, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e2, 1.9);
  sun.position.set(4.5, 8, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -6;
  sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -6;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 20;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun);

  const engine = {
    renderer,
    scene,
    camera,
    focus,
    night,
    radius: 3,
    updaters: new Set(),
    running: false,
    visible: true,
    elapsed: 0,
    setNight(isNight) {
      engine.night = isNight;
      hemi.color.set(isNight ? 0x8796b8 : 0xf3f6f0);
      hemi.groundColor.set(isNight ? 0x1c2420 : 0x5d6b5a);
      hemi.intensity = isNight ? 0.55 : 1.15;
      sun.color.set(isNight ? 0xa9bce8 : 0xfff4e2);
      sun.intensity = isNight ? 0.55 : 1.9;
    },
    /** Frames the plinth: a larger garden pulls the camera back so every stage fills the view the same way. */
    frame(radius) {
      engine.radius = radius;
      resize();
    },
    add(fn) {
      engine.updaters.add(fn);
      return () => engine.updaters.delete(fn);
    },
    start() {
      if (engine.running) return;
      engine.running = true;
      clock.reset?.();
      renderer.setAnimationLoop(tick);
    },
    stop() {
      engine.running = false;
      renderer.setAnimationLoop(null);
    },
    renderOnce() {
      renderer.render(scene, camera);
    },
    dispose() {
      engine.stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit the plinth (plus headroom for characters and trees) into whichever dimension is tighter.
    const needed = engine.radius * 1.08;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const fitHeight = needed / Math.tan(vFov / 2);
    const fitWidth = needed / (Math.tan(vFov / 2) * camera.aspect);
    const distance = Math.max(fitHeight * 0.92, fitWidth);
    const elevation = THREE.MathUtils.degToRad(30);
    camera.position.set(0, focus.y + Math.sin(elevation) * distance, Math.cos(elevation) * distance);
    camera.lookAt(focus);
    camera.updateProjectionMatrix();
    if (!engine.running) engine.renderOnce();
  }

  const clock = new THREE.Timer();
  function tick(timestamp) {
    clock.update(timestamp);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    engine.elapsed += dt;
    for (const fn of engine.updaters) fn(dt, engine.elapsed);
    renderer.render(scene, camera);
  }

  // Only animate while the garden is on screen and the tab is visible.
  const sync = () => (engine.visible && !document.hidden ? engine.start() : engine.stop());
  const io = new IntersectionObserver(([entry]) => {
    engine.visible = entry.isIntersecting;
    sync();
  });
  io.observe(container);
  const onVisibility = () => sync();
  document.addEventListener('visibilitychange', onVisibility);
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  engine.setNight(night);
  resize();
  return engine;
}

export { PALETTE };
