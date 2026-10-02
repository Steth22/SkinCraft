import * as THREE from './three.module.min.js';
import { FACES, faceRects, partDefs } from './skin.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A box with one quad per face, UV-mapped exactly onto the Minecraft skin layout.
// geometry.userData.rects[faceIndex >> 1] gives the texture rect hit by a raycast.
export function boxGeometry(size, uvOrigin, inflate) {
  const [w, h, d] = size;
  const half = [w / 2 + inflate, h / 2 + inflate, d / 2 + inflate];
  const rects = faceRects(uvOrigin[0], uvOrigin[1], w, h, d);
  const pos = [], uv = [], nor = [], idx = [], faceRectList = [];
  for (const f of FACES) {
    const r = rects[f.name];
    faceRectList.push(r);
    const sc = (c) => c.map((s, i) => s * half[i]);
    const TL = sc(f.tl), TR = sc(f.tr), BL = sc(f.bl);
    const BR = [TR[0] + BL[0] - TL[0], TR[1] + BL[1] - TL[1], TR[2] + BL[2] - TL[2]];
    const u0 = r[0] / 64, u1 = (r[0] + r[2]) / 64, v0 = 1 - r[1] / 64, v1 = 1 - (r[1] + r[3]) / 64;
    const b = pos.length / 3;
    pos.push(...TL, ...TR, ...BL, ...BR);
    uv.push(u0, v0, u1, v0, u0, v1, u1, v1);
    for (let i = 0; i < 4; i++) nor.push(...f.n);
    if (dot(cross(sub(BL, TL), sub(TR, TL)), f.n) > 0) idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    else idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.userData.rects = faceRectList;
  return g;
}

const s = Math.sin;
export const POSES = {
  still: () => ({}),
  idle: (t) => ({
    head: [s(t * 0.9) * 0.05, s(t * 0.45) * 0.28, 0],
    rightArm: [s(t * 1.3) * 0.06, 0, -0.07 - s(t * 1.6) * 0.04],
    leftArm: [-s(t * 1.3) * 0.06, 0, 0.07 + s(t * 1.6) * 0.04],
  }),
  walk: (t) => {
    const a = s(t * 6.5) * 0.75;
    return {
      head: [0, s(t * 1.2) * 0.18, 0],
      rightArm: [a, 0, -0.05], leftArm: [-a, 0, 0.05],
      rightLeg: [-a, 0, 0], leftLeg: [a, 0, 0],
      bob: Math.abs(Math.cos(t * 6.5)) * 0.7,
    };
  },
  wave: (t) => ({
    head: [-0.08, -0.3, s(t * 2) * 0.08],
    rightArm: [0, 0, -2.65 + s(t * 9) * 0.38],
    leftArm: [0, 0, 0.08],
  }),
  zombie: (t) => ({
    head: [0.06, s(t * 0.7) * 0.22, s(t * 0.9) * 0.06],
    rightArm: [-1.5 + s(t * 2.2) * 0.07, 0, -0.08],
    leftArm: [-1.5 - s(t * 2.2) * 0.07, 0, 0.08],
    rightLeg: [s(t * 3) * 0.32, 0, 0], leftLeg: [-s(t * 3) * 0.32, 0, 0],
    bob: Math.abs(Math.cos(t * 3)) * 0.4,
  }),
  dance: (t) => {
    const b = s(t * 8);
    return {
      head: [Math.abs(b) * 0.25 - 0.1, s(t * 4) * 0.3, s(t * 4) * 0.15],
      body: [0, s(t * 4) * 0.25, 0],
      rightArm: [s(t * 8) * 0.4 - 0.4, 0, -1.2 - b * 0.6],
      leftArm: [-s(t * 8) * 0.4 - 0.4, 0, 1.2 - b * 0.6],
      rightLeg: [0, 0, -Math.max(0, b) * 0.35], leftLeg: [0, 0, Math.max(0, -b) * 0.35],
      bob: Math.abs(b) * 1.2,
    };
  },
};

const ZERO = [0, 0, 0];

export class PlayerModel {
  constructor(map = null) {
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    this.baseMat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5 });
    this.overMat = new THREE.MeshLambertMaterial({ map, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide });
    this.parts = {};
    this.baseMeshes = [];
    this.overMeshes = [];
    this.rot = {};
    this.bob = 0;
    this.slim = null;
  }

  setMap(map) {
    const recompile = !this.baseMat.map !== !map;
    this.baseMat.map = map;
    this.overMat.map = map;
    if (recompile) this.baseMat.needsUpdate = this.overMat.needsUpdate = true;
  }

  build(slim) {
    if (this.slim === slim) return;
    this.slim = slim;
    for (const p of Object.values(this.parts)) {
      this.inner.remove(p.pivot);
      p.base.geometry.dispose();
      p.over.geometry.dispose();
    }
    this.parts = {};
    this.baseMeshes = [];
    this.overMeshes = [];
    for (const def of partDefs(slim)) {
      const pivot = new THREE.Group();
      pivot.position.set(...def.pivot);
      const base = new THREE.Mesh(boxGeometry(def.size, def.base, 0), this.baseMat);
      const over = new THREE.Mesh(boxGeometry(def.size, def.over, def.inflate), this.overMat);
      base.position.set(...def.offset);
      over.position.set(...def.offset);
      over.renderOrder = 1;
      base.userData = { part: def.id, layer: 'base' };
      over.userData = { part: def.id, layer: 'over' };
      pivot.add(base, over);
      this.inner.add(pivot);
      this.parts[def.id] = { pivot, base, over, def };
      this.baseMeshes.push(base);
      this.overMeshes.push(over);
      this.rot[def.id] ??= [0, 0, 0];
      pivot.rotation.set(...this.rot[def.id]);
    }
  }

  setPartVisible(id, visible) {
    if (this.parts[id]) this.parts[id].pivot.visible = visible;
  }

  setLayers(base, over) {
    for (const m of this.baseMeshes) m.visible = base;
    for (const m of this.overMeshes) m.visible = over;
  }

  update(dt, pose, t) {
    const target = (POSES[pose] || POSES.still)(t);
    const k = 1 - Math.exp(-dt * 9);
    for (const id in this.parts) {
      const cur = this.rot[id];
      const tg = target[id] || ZERO;
      for (let i = 0; i < 3; i++) cur[i] += (tg[i] - cur[i]) * k;
      this.parts[id].pivot.rotation.set(cur[0], cur[1], cur[2]);
    }
    this.bob += ((target.bob || 0) - this.bob) * k;
    this.inner.position.y = this.bob;
  }
}
