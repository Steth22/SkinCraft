export const FACES = [
  { name: 'front',  n: [0, 0, 1],  tl: [-1, 1, 1],   tr: [1, 1, 1],   bl: [-1, -1, 1] },
  { name: 'back',   n: [0, 0, -1], tl: [1, 1, -1],   tr: [-1, 1, -1], bl: [1, -1, -1] },
  { name: 'right',  n: [-1, 0, 0], tl: [-1, 1, -1],  tr: [-1, 1, 1],  bl: [-1, -1, -1] },
  { name: 'left',   n: [1, 0, 0],  tl: [1, 1, 1],    tr: [1, 1, -1],  bl: [1, -1, 1] },
  { name: 'top',    n: [0, 1, 0],  tl: [-1, 1, -1],  tr: [1, 1, -1],  bl: [-1, 1, 1] },
  { name: 'bottom', n: [0, -1, 0], tl: [-1, -1, -1], tr: [1, -1, -1], bl: [-1, -1, 1] },
];

export const PART_LABEL = {
  head: 'Head', body: 'Body', rightArm: 'Right Arm', leftArm: 'Left Arm', rightLeg: 'Right Leg', leftLeg: 'Left Leg',
};

export function faceRects(u, v, w, h, d) {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h],
  };
}

export function partDefs(slim) {
  const aw = slim ? 3 : 4;
  return [
    { id: 'head', size: [8, 8, 8], base: [0, 0], over: [32, 0], inflate: 0.5, pivot: [0, 24, 0], offset: [0, 4, 0] },
    { id: 'body', size: [8, 12, 4], base: [16, 16], over: [16, 32], inflate: 0.25, pivot: [0, 24, 0], offset: [0, -6, 0] },
    { id: 'rightArm', size: [aw, 12, 4], base: [40, 16], over: [40, 32], inflate: 0.25, pivot: [-(4 + aw / 2), 22, 0], offset: [0, -4, 0] },
    { id: 'leftArm', size: [aw, 12, 4], base: [32, 48], over: [48, 48], inflate: 0.25, pivot: [4 + aw / 2, 22, 0], offset: [0, -4, 0] },
    { id: 'rightLeg', size: [4, 12, 4], base: [0, 16], over: [0, 32], inflate: 0.25, pivot: [-2, 12, 0], offset: [0, -6, 0] },
    { id: 'leftLeg', size: [4, 12, 4], base: [16, 48], over: [0, 48], inflate: 0.25, pivot: [2, 12, 0], offset: [0, -6, 0] },
  ];
}

const infoCache = {};

// Per-texel lookup tables: which layer/face each texel belongs to, and its left/right mirror twin.
export function texelInfo(slim) {
  const key = slim ? 'slim' : 'classic';
  if (infoCache[key]) return infoCache[key];
  const mask = new Uint8Array(4096);
  const faceOf = new Int16Array(4096).fill(-1);
  const mirror = new Int16Array(4096).fill(-1);
  const faces = [];
  const byKey = new Map();
  const spots = new Array(4096);
  const k = (x, y, z, n) => `${Math.round(x * 64)},${Math.round(y * 64)},${Math.round(z * 64)},${n.join(',')}`;

  for (const p of partDefs(slim)) {
    for (const layer of ['base', 'over']) {
      const infl = layer === 'over' ? p.inflate : 0;
      const [w, h, d] = p.size;
      const half = [w / 2 + infl, h / 2 + infl, d / 2 + infl];
      const rects = faceRects(p[layer][0], p[layer][1], w, h, d);
      const o = [0, 1, 2].map((i) => p.pivot[i] + p.offset[i]);
      for (const f of FACES) {
        const r = rects[f.name];
        const fi = faces.length;
        faces.push({ part: p.id, layer, face: f.name, rect: r });
        const TL = f.tl.map((s, i) => s * half[i]);
        const TR = f.tr.map((s, i) => s * half[i]);
        const BL = f.bl.map((s, i) => s * half[i]);
        for (let j = 0; j < r[3]; j++) {
          for (let i = 0; i < r[2]; i++) {
            const t = (r[1] + j) * 64 + r[0] + i;
            mask[t] = layer === 'base' ? 1 : 2;
            faceOf[t] = fi;
            const a = (i + 0.5) / r[2], b = (j + 0.5) / r[3];
            const pos = [0, 1, 2].map((c) => o[c] + TL[c] + (TR[c] - TL[c]) * a + (BL[c] - TL[c]) * b);
            byKey.set(k(pos[0], pos[1], pos[2], f.n), t);
            spots[t] = [pos, f.n];
          }
        }
      }
    }
  }
  for (let t = 0; t < 4096; t++) {
    const s = spots[t];
    if (!s) continue;
    const [pos, n] = s;
    const m = byKey.get(k(-pos[0], pos[1], pos[2], [n[0] === 0 ? 0 : -n[0], n[1], n[2]]));
    if (m !== undefined) mirror[t] = m;
  }
  return (infoCache[key] = { mask, faceOf, faces, mirror });
}

export function canvas64() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  return c;
}

export function makeDefaultSkin(slim) {
  const c = canvas64();
  const ctx = c.getContext('2d');
  for (const p of partDefs(slim)) {
    const rects = faceRects(p.base[0], p.base[1], ...p.size);
    for (const name in rects) {
      const [x, y, w, h] = rects[name];
      ctx.fillStyle = '#4b4b52';
      ctx.fillRect(x, y, w, h);
      if (w > 2 && h > 2) {
        ctx.fillStyle = '#9b9ba3';
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      }
    }
  }
  return c;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

export const b64ToSrc = (b64) => 'data:image/png;base64,' + b64;
export const canvasToB64 = (c) => c.toDataURL('image/png').split(',')[1];

export function normalizeSkin(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = canvas64();
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  if (w === h && w >= 64 && w % 64 === 0) {
    ctx.drawImage(img, 0, 0, 64, 64);
  } else if (w === h * 2 && w >= 64 && w % 64 === 0) {
    ctx.drawImage(img, 0, 0, 64, 32);
    convertLegacy(c);
  } else {
    throw new Error(`Not a Minecraft skin (got ${w}×${h}, need 64×64 or 64×32)`);
  }
  return c;
}

// Old 64x32 skins have no left limbs: build them by mirroring the right ones like Minecraft does.
function convertLegacy(c) {
  const ctx = c.getContext('2d');
  const src = canvas64();
  src.getContext('2d').drawImage(c, 0, 0);
  const swap = { right: 'left', left: 'right' };
  const copy = (from, to) => {
    const s = faceRects(from[0], from[1], 4, 12, 4);
    const d = faceRects(to[0], to[1], 4, 12, 4);
    for (const f in s) {
      const [sx, sy, sw, sh] = s[f];
      const [dx, dy] = d[swap[f] || f];
      ctx.save();
      ctx.translate(dx + sw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
      ctx.restore();
    }
  };
  copy([0, 16], [16, 48]);
  copy([40, 16], [32, 48]);
}

export function detectSlim(c) {
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(54, 20, 2, 12).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  return true;
}
