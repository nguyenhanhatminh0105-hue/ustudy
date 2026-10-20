import * as THREE from 'three';

/** The garden's palette. Day and night share hues; night lowers value and lights the lanterns. */
export const PALETTE = {
  gravel: 0xd0d3cd,
  gravelShade: 0xb9bcb4,
  plinth: 0x7d857c,
  plinthDark: 0x5c645b,
  moss: 0x5d8a4f,
  mossDeep: 0x3d6236,
  mossLight: 0x88b06c,
  stone: 0x8d918b,
  stoneDark: 0x6c706b,
  stoneLight: 0xb4b7b0,
  water: 0x3d6f82,
  waterDeep: 0x24485a,
  waterFoam: 0xd8ecef,
  sand: 0xd8c9a3,
  bamboo: 0x7fa64a,
  bambooNode: 0x5c7f33,
  bambooLeaf: 0x6f9b3d,
  wood: 0x7a5236,
  woodDark: 0x553824,
  roof: 0x3b3f45,
  maple: 0xd4552f,
  mapleDeep: 0xa83e22,
  koi: 0xf07a3a,
  koiWhite: 0xf4efe6,
  lantern: 0xffcf7a,
  ink: 0x1d2320,
  white: 0xfbfaf6,
  blush: 0xf2a7a0,
  // turtle
  turtleSkin: 0x9cc96b,
  turtleSkinDeep: 0x76a54d,
  shell: 0x8a5a3b,
  shellPlate: 0xb07a4f,
  shellRim: 0x5f3d27,
  plastron: 0xe8d8a8,
  // panda
  pandaWhite: 0xf6f3ec,
  pandaBlack: 0x262a2c,
  straw: 0xd9b56a,
  strawDeep: 0xb08c45,
  scarf: 0x3f7f8c,
  headphones: 0x2f6f6a,
};

let gradientMap;
function toonGradient() {
  if (gradientMap) return gradientMap;
  // Three soft bands: shadow, mid, light. Reads as hand-painted rather than plastic.
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const cache = new Map();

/** Shared toon material per colour (and options), so hundreds of meshes reuse a handful of programs. */
export function toon(color, { emissive = 0x000000, emissiveIntensity = 0, transparent = false, opacity = 1, side } = {}) {
  const key = `${color}|${emissive}|${emissiveIntensity}|${transparent}|${opacity}|${side ?? ''}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      new THREE.MeshToonMaterial({
        color,
        gradientMap: toonGradient(),
        emissive,
        emissiveIntensity,
        transparent,
        opacity,
        side: side ?? THREE.FrontSide,
      }),
    );
  }
  return cache.get(key);
}

const outlineMaterials = new Map();

/** Inverted-hull ink outline: the mesh redrawn slightly larger along its normals, back faces only. */
export function outlineMaterial(thickness = 0.018, color = PALETTE.ink) {
  const key = `${thickness}|${color}`;
  if (!outlineMaterials.has(key)) {
    outlineMaterials.set(
      key,
      new THREE.ShaderMaterial({
        uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(color) } },
        vertexShader: /* glsl */ `
          uniform float thickness;
          void main() {
            vec3 p = position + normalize(normal) * thickness;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 color;
          void main() { gl_FragColor = vec4(color, 1.0); }`,
        side: THREE.BackSide,
      }),
    );
  }
  return outlineMaterials.get(key);
}

/** A toon mesh with an ink outline child. */
export function inked(geometry, color, { thickness = 0.018, castShadow = true, ...opts } = {}) {
  const mesh = new THREE.Mesh(geometry, toon(color, opts));
  mesh.castShadow = castShadow;
  const outline = new THREE.Mesh(geometry, outlineMaterial(thickness));
  outline.raycast = () => {};
  mesh.add(outline);
  return mesh;
}

export function plain(geometry, color, opts = {}) {
  const mesh = new THREE.Mesh(geometry, toon(color, opts));
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = opts.receiveShadow ?? false;
  return mesh;
}

export function disposeTree(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material?.map) obj.material.map.dispose();
  });
}
