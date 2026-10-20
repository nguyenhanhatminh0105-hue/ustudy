import * as THREE from 'three';
import { PALETTE, inked, plain } from './materials.js';

/** Little 3D treats that float down to the companion when you give a gift. */
export function buildTreat(id) {
  const g = new THREE.Group();
  if (id === 'milk') {
    const bottle = inked(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 16), 0xf7f5ef, { thickness: 0.008 });
    g.add(bottle);
    const label = plain(new THREE.CylinderGeometry(0.071, 0.071, 0.05, 16), 0x7fb6c9, { castShadow: false });
    g.add(label);
    const cap = inked(new THREE.CylinderGeometry(0.035, 0.04, 0.04, 12), 0x3d6f82, { thickness: 0.006 });
    cap.position.y = 0.1;
    g.add(cap);
  } else if (id === 'cookie') {
    const disc = inked(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20), 0xd39a57, { thickness: 0.008 });
    disc.rotation.x = Math.PI / 2.4;
    g.add(disc);
    for (const [x, y] of [[0.03, 0.02], [-0.035, 0.03], [0.0, -0.035], [0.045, -0.03]]) {
      const chip = plain(new THREE.SphereGeometry(0.014, 6, 5), 0x4a2f1f, { castShadow: false });
      chip.position.set(x, y, 0.02);
      disc.add(chip);
      chip.position.set(x, 0.018, y);
    }
  } else {
    // A wedge of strawberry shortcake.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.16, 0.05);
    shape.lineTo(0.16, -0.05);
    shape.closePath();
    const sponge = inked(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }), 0xf3e2b8, { thickness: 0.008 });
    sponge.rotation.x = -Math.PI / 2;
    sponge.position.set(-0.08, -0.06, 0);
    g.add(sponge);
    const cream = plain(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false }), 0xfbfaf6);
    cream.rotation.x = -Math.PI / 2;
    cream.position.set(-0.08, 0.06, 0);
    g.add(cream);
    const berry = inked(new THREE.SphereGeometry(0.03, 10, 8), 0xe2483d, { thickness: 0.005 });
    berry.position.set(0.04, 0.11, 0);
    g.add(berry);
  }
  g.userData.id = id;
  return g;
}

export { PALETTE };
