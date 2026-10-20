import * as THREE from 'three';

/** Small hand-drawn sprites for reactions: hearts, sparkles, Zs, crumbs, droplets, notes, leaves. */
const textures = new Map();

function drawTexture(kind) {
  if (textures.has(kind)) return textures.get(kind);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const ink = '#1d2320';
  switch (kind) {
    case 'heart': {
      g.fillStyle = '#ef6f6c';
      g.strokeStyle = ink;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(32, 52);
      g.bezierCurveTo(8, 36, 8, 14, 22, 14);
      g.bezierCurveTo(28, 14, 32, 20, 32, 24);
      g.bezierCurveTo(32, 20, 36, 14, 42, 14);
      g.bezierCurveTo(56, 14, 56, 36, 32, 52);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.ellipse(22, 24, 4, 3, -0.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'sparkle': {
      g.fillStyle = '#ffd36e';
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const r = i % 2 ? 9 : 26;
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case 'z': {
      g.fillStyle = '#3d6f82';
      g.strokeStyle = '#fbfaf6';
      g.lineWidth = 6;
      g.font = '700 44px "Zen Maru Gothic", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.strokeText('z', 32, 34);
      g.fillText('z', 32, 34);
      break;
    }
    case 'note': {
      g.fillStyle = ink;
      g.beginPath();
      g.ellipse(24, 46, 9, 7, -0.4, 0, Math.PI * 2);
      g.fill();
      g.fillRect(30, 12, 5, 34);
      g.beginPath();
      g.moveTo(35, 12);
      g.quadraticCurveTo(52, 18, 48, 30);
      g.quadraticCurveTo(46, 22, 35, 22);
      g.fill();
      break;
    }
    case 'drop': {
      g.fillStyle = '#9fd3e0';
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(32, 10);
      g.quadraticCurveTo(50, 36, 32, 52);
      g.quadraticCurveTo(14, 36, 32, 10);
      g.fill();
      g.stroke();
      break;
    }
    case 'crumb': {
      g.fillStyle = '#c98d4b';
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(20, 22);
      g.lineTo(44, 18);
      g.lineTo(48, 40);
      g.lineTo(26, 46);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case 'leaf': {
      g.fillStyle = '#88b06c';
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(10, 50);
      g.quadraticCurveTo(14, 12, 54, 10);
      g.quadraticCurveTo(50, 46, 10, 50);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(12, 48);
      g.lineTo(44, 20);
      g.stroke();
      break;
    }
    case 'swirl': {
      g.strokeStyle = ink;
      g.lineWidth = 4;
      g.beginPath();
      for (let a = 0; a < Math.PI * 4; a += 0.2) g.lineTo(32 + Math.cos(a) * a * 2.2, 32 + Math.sin(a) * a * 2.2);
      g.stroke();
      break;
    }
    default:
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set(kind, tex);
  return tex;
}

export function createEffects(scene) {
  const live = [];
  const group = new THREE.Group();
  scene.add(group);

  /**
   * spawn('heart', position, { count, spread, rise, life, size, gravity, velocity })
   */
  function spawn(kind, at, opts = {}) {
    const { count = 1, spread = 0.15, rise = 0.6, life = 1.2, size = 0.14, gravity = 0, velocity = null, delay = 0 } = opts;
    for (let i = 0; i < count; i += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: drawTexture(kind), transparent: true, depthWrite: false }));
      sprite.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.5, (Math.random() - 0.5) * spread));
      sprite.scale.setScalar(0.0001);
      const v = velocity
        ? velocity.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6))
        : new THREE.Vector3((Math.random() - 0.5) * 0.25, rise * (0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.25);
      group.add(sprite);
      live.push({ sprite, v, age: -delay - i * 0.08, life, size: size * (0.8 + Math.random() * 0.4), gravity, spin: (Math.random() - 0.5) * 3 });
    }
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const p = live[i];
      p.age += dt;
      if (p.age < 0) continue;
      if (p.age >= p.life) {
        group.remove(p.sprite);
        p.sprite.material.dispose();
        live.splice(i, 1);
        continue;
      }
      const k = p.age / p.life;
      p.v.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.v, dt);
      // Pop in with a little overshoot, then fade.
      const pop = k < 0.15 ? Math.sin((k / 0.15) * Math.PI * 0.5) * 1.15 : 1 + (1 - Math.min(1, (k - 0.15) / 0.2)) * 0.15;
      p.sprite.scale.setScalar(p.size * pop);
      p.sprite.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      p.sprite.material.rotation += p.spin * dt * 0.3;
    }
  }

  return { spawn, update, clear: () => live.splice(0).forEach((p) => group.remove(p.sprite)) };
}
