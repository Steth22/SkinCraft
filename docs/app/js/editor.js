import * as THREE from './three.module.min.js';
import { PlayerModel } from './model.js';
import { texelInfo, PART_LABEL, loadImage, normalizeSkin, b64ToSrc, canvasToB64 } from './skin.js';
import { api } from './bridge.js';
import { $, $$, h, sfx, toast, icon, keyOf } from './ui.js';
import { ColorPicker, hexToRgb, rgbToHex } from './colorpicker.js';

const TOOLS = [
  { id: 'pencil', name: 'Pencil', key: 'B', tip: 'Paint pixels' },
  { id: 'eraser', name: 'Eraser', key: 'E', tip: 'Make pixels transparent' },
  { id: 'fill', name: 'Fill', key: 'G', tip: 'Fill one face with a color' },
  { id: 'picker', name: 'Color Picker', key: 'I', tip: 'Tip: Alt+Click picks with any tool' },
  { id: 'noise', name: 'Noise Brush', key: 'N', tip: 'Paint with random shading' },
  { id: 'shade', name: 'Shade', key: 'S', tip: 'Darken · hold Shift to lighten' },
];
const PALETTE = [
  '#1d1d21', '#474f52', '#9d9d97', '#f9fffe', '#b02e26', '#f9801d', '#fed83d',
  '#80c71f', '#5e7c16', '#169c9c', '#3ab3da', '#3c44aa', '#8932b8', '#c74ebd',
  '#f38baa', '#835432', '#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524',
];
const POSES = [['still', 'Still'], ['idle', 'Idle'], ['walk', 'Walk'], ['wave', 'Wave'], ['zombie', 'Zombie'], ['dance', 'Dance']];
const UNDO_MAX = 150;
const DEFAULT_VIEW = { theta: 0.5, phi: 1.36, dist: 60 };
const CENTER = new THREE.Vector3(0, 16, 0);
const HINT = 'Right-drag: rotate · Shift/Middle-drag: move · Wheel: zoom';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const elastic = (x) => (x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);

function line(a, b) {
  let x0 = a % 64, y0 = (a / 64) | 0;
  const x1 = b % 64, y1 = (b / 64) | 0;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const out = [];
  for (;;) {
    out.push(y0 * 64 + x0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('sc-prefs')) || {}; } catch { return {}; }
}

export class Editor {
  constructor(world) {
    this.world = world;
    this.el = $('#screen-editor');
    this.active = false;
    this.onBack = null;

    this.skin = document.createElement('canvas');
    this.skin.width = this.skin.height = 64;
    this.sctx = this.skin.getContext('2d', { willReadFrequently: true });
    this.img = this.sctx.createImageData(64, 64);
    this.px = this.img.data;

    this.disp = document.createElement('canvas');
    this.disp.width = this.disp.height = 512;
    this.dctx = this.disp.getContext('2d');
    this.dimg = this.dctx.createImageData(512, 512);
    this.tex = new THREE.CanvasTexture(this.disp);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = world.renderer.capabilities.getMaxAnisotropy();

    this.model = new PlayerModel(this.tex);
    world.stage.add(this.model.root);

    const p = loadPrefs();
    this.st = {
      tool: TOOLS.some((t) => t.id === p.tool) ? p.tool : 'pencil',
      size: [1, 2, 3].includes(p.size) ? p.size : 1,
      mirror: !!p.mirror,
      grid: p.grid !== false,
      pose: POSES.some(([id]) => id === p.pose) ? p.pose : 'idle',
      color: /^#[0-9a-f]{6}$/.test(p.color) ? p.color : '#3ab3da',
      strength: clamp(+p.strength || 16, 4, 40),
      fillMode: ['area', 'face', 'part', 'all'].includes(p.fillMode) ? p.fillMode : 'area',
      layer: 'base',
      showBase: true,
      showOver: true,
      parts: { head: true, body: true, rightArm: true, leftArm: true, rightLeg: true, leftLeg: true },
    };
    this.rgb = hexToRgb(this.st.color);
    try { this.recent = JSON.parse(localStorage.getItem('sc-recent')) || []; } catch { this.recent = []; }

    this.undoStack = [];
    this.redoStack = [];
    this.hover = [];
    this.hoverMirror = [];
    this.hoverT = -1;
    this.stroke = null;
    this.drag = null;
    this.time = 0;
    this.entT = null;
    this.fxAt = 0;
    this.sndAt = 0;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.orbit = {
      theta: 0, phi: 0, dist: 0, tTheta: 0, tPhi: 0, tDist: 0,
      target: new THREE.Vector3(0, 16, 0), tTarget: new THREE.Vector3(0, 16, 0),
    };

    this.checker = document.createElement('canvas');
    this.checker.width = this.checker.height = 512;
    const cc = this.checker.getContext('2d');
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      cc.fillStyle = (x + y) & 1 ? '#2b2a35' : '#35343f';
      cc.fillRect(x * 4, y * 4, 4, 4);
    }
    this.decor = document.createElement('canvas');
    this.decor.width = this.decor.height = 512;

    this.buildUI();
    this.bindPointer();
    this.bindKeys();
    world.onResize.push(() => this.active && this.updateViewOffset());
  }

  // ---------- UI ----------
  buildUI() {
    const tools = $('#ed-tools');
    for (const t of TOOLS) {
      const b = h('button', { class: 'mc-btn icon tool', 'data-tool': t.id, 'data-tip': `${t.name}  [${t.key}]|${t.tip}`, html: icon(t.id, 2) });
      b.onclick = () => this.setTool(t.id);
      tools.append(b);
    }
    tools.append(h('div', { class: 'sep' }));
    for (const n of [1, 2, 3]) {
      const b = h('button', { class: 'mc-btn icon size', 'data-size': n, 'data-tip': `Brush ${n}×${n}|Key ${n}`, html: `<i style="--n:${n}"></i>` });
      b.onclick = () => this.setSize(n);
      tools.append(b);
    }
    tools.append(h('div', { class: 'sep' }));
    this.btnMirror = h('button', { class: 'mc-btn icon', 'data-tip': 'Mirror mode  [M]|Paints the left and right side together', html: icon('mirror', 2) });
    this.btnMirror.onclick = () => this.toggleMirror();
    this.btnGrid = h('button', { class: 'mc-btn icon', 'data-tip': 'Pixel grid  [L]', html: icon('grid', 2) });
    this.btnGrid.onclick = () => this.toggleGrid();
    tools.append(this.btnMirror, this.btnGrid);

    const strength = $('#ed-strength');
    strength.value = this.st.strength;
    $('#ed-strength-v').textContent = this.st.strength + '%';
    strength.oninput = () => {
      this.st.strength = +strength.value;
      $('#ed-strength-v').textContent = this.st.strength + '%';
      this.savePrefs();
    };
    $$('#opt-fill [data-fill]').forEach((b) => {
      b.onclick = () => {
        this.st.fillMode = b.dataset.fill;
        this.refreshToolUI();
        this.savePrefs();
        this.hoverT = -2;
      };
    });

    $('#ed-back').innerHTML = icon('back', 2);
    $('#ed-back').onclick = () => this.onBack?.();
    $('#ed-undo').innerHTML = icon('undo', 2);
    $('#ed-redo').innerHTML = icon('redo', 2);
    $('#ed-undo').onclick = () => this.undo();
    $('#ed-redo').onclick = () => this.redo();
    $('#ed-export').innerHTML = icon('download', 2) + '<span>Export PNG</span>';
    $('#ed-export').onclick = () => this.exportPng();
    $('#ed-name').addEventListener('input', () => this.scheduleSave());
    $$('.model-seg button').forEach((b) => (b.onclick = () => this.setModelType(b.dataset.v)));

    const side = $('#ed-side');
    $('#ed-sheet-btn').onclick = () => side.classList.toggle('open');
    $('#ed-sheet-close').onclick = () => side.classList.remove('open');

    this.picker = new ColorPicker($('#ed-picker'), (hex) => this.setColor(hex, true));
    this.picker.set(this.st.color);
    const pal = $('#ed-palette');
    for (const c of PALETTE) {
      const s = h('button', { class: 'swatch', style: `--c:${c}`, 'data-c': c, 'data-tip': c.toUpperCase() });
      s.onclick = () => this.setColor(c);
      pal.append(s);
    }
    this.renderRecent();

    $$('#ed-layer button').forEach((b) => (b.onclick = () => this.setLayer(b.dataset.v)));
    $('#vis-base').onclick = () => { this.st.showBase = !this.st.showBase; this.applyVis(); };
    $('#vis-over').onclick = () => { this.st.showOver = !this.st.showOver; this.applyVis(); };
    $$('.mb-part').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.part;
        this.st.parts[id] = !this.st.parts[id];
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
        this.applyVis();
      };
    });

    const vb = $('#ed-viewbar');
    const poses = h('div', { class: 'seg' });
    for (const [id, label] of POSES) {
      const b = h('button', { class: 'mc-btn sm', 'data-pose': id, text: label, 'data-tip': `${label} pose` });
      b.onclick = () => this.setPose(id);
      poses.append(b);
    }
    const views = h('div', { class: 'seg' });
    const view = (label, tip, fn) => {
      const b = h('button', { class: 'mc-btn sm', text: label, 'data-tip': tip });
      b.onclick = fn;
      views.append(b);
    };
    view('Front', 'Front view  [F]', () => this.setView(0));
    view('Back', 'Back view', () => this.setView(Math.PI));
    view('Side', 'Side view (click again to flip)', () => this.setView(Math.abs(this.angleTo(Math.PI / 2)) < 0.3 ? -Math.PI / 2 : Math.PI / 2));
    const reset = h('button', { class: 'mc-btn icon sm', 'data-tip': 'Reset camera  [R]', html: icon('reset', 2) });
    reset.onclick = () => this.resetView();
    views.append(reset);
    vb.append(poses, h('div', { class: 'vsep' }), views);

    this.c2d = $('#ed-2d');
    this.ctx2d = this.c2d.getContext('2d');
    this.refreshToolUI();
  }

  refreshToolUI() {
    $$('#ed-tools .tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === this.st.tool));
    $$('#ed-tools .size').forEach((b) => b.classList.toggle('active', +b.dataset.size === this.st.size));
    this.btnMirror.classList.toggle('active', this.st.mirror);
    this.btnGrid.classList.toggle('active', this.st.grid);
    const strengthTool = ['noise', 'shade'].includes(this.st.tool);
    const opts = $('#ed-opts');
    const showOpts = strengthTool || this.st.tool === 'fill';
    if (showOpts && opts.classList.contains('hidden')) {
      opts.style.animation = 'none';
      void opts.offsetWidth;
      opts.style.animation = '';
    }
    opts.classList.toggle('hidden', !showOpts);
    $('#opt-strength').classList.toggle('hidden', !strengthTool);
    $('#opt-fill').classList.toggle('hidden', this.st.tool !== 'fill');
    $$('#opt-fill [data-fill]').forEach((b) => b.classList.toggle('active', b.dataset.fill === this.st.fillMode));
    $$('#ed-viewbar [data-pose]').forEach((b) => b.classList.toggle('active', b.dataset.pose === this.st.pose));
    $$('#ed-layer button').forEach((b) => b.classList.toggle('active', b.dataset.v === this.st.layer));
    $$('.model-seg button').forEach((b) => b.classList.toggle('active', b.dataset.v === this.doc?.model));
    $$('#ed-palette .swatch, #ed-recent .swatch').forEach((s) => s.classList.toggle('active', s.dataset.c === this.st.color));
    $('#ed-sheet-btn').style.setProperty('--c', this.st.color);
  }

  savePrefs() {
    const { tool, size, mirror, grid, pose, color, strength, fillMode } = this.st;
    try { localStorage.setItem('sc-prefs', JSON.stringify({ tool, size, mirror, grid, pose, color, strength, fillMode })); } catch {}
  }

  setTool(id) {
    if (id === this.st.tool) return;
    if (id === 'picker') this.prevTool = this.st.tool;
    this.st.tool = id;
    const b = $(`#ed-tools [data-tool="${id}"]`);
    b.classList.remove('bounce');
    void b.offsetWidth;
    b.classList.add('bounce');
    this.refreshToolUI();
    this.savePrefs();
    this.hoverT = -2;
  }

  setSize(n) { this.st.size = n; this.refreshToolUI(); this.savePrefs(); this.hoverT = -2; }
  toggleMirror() { this.st.mirror = !this.st.mirror; this.refreshToolUI(); this.savePrefs(); this.hoverT = -2; }
  toggleGrid() { this.st.grid = !this.st.grid; this.refreshToolUI(); this.savePrefs(); this.dirty = true; }
  setPose(id) { this.st.pose = id; this.refreshToolUI(); this.savePrefs(); }

  setColor(hex, fromPicker = false) {
    this.st.color = hex;
    this.rgb = hexToRgb(hex);
    if (!fromPicker) this.picker.set(hex);
    this.refreshToolUI();
    this.savePrefs();
    this.hoverDirty = true;
  }

  pushRecent(hex) {
    if (this.recent[0] === hex) return;
    this.recent = [hex, ...this.recent.filter((c) => c !== hex)].slice(0, 14);
    try { localStorage.setItem('sc-recent', JSON.stringify(this.recent)); } catch {}
    this.renderRecent();
  }

  renderRecent() {
    const el = $('#ed-recent');
    el.innerHTML = '';
    if (!this.recent.length) el.append(h('div', { class: 'muted small', text: 'Colors you paint with show up here' }));
    for (const c of this.recent) {
      const s = h('button', { class: 'swatch', style: `--c:${c}`, 'data-c': c, 'data-tip': c.toUpperCase() });
      s.onclick = () => this.setColor(c);
      el.append(s);
    }
    this.refreshToolUI();
  }

  setLayer(layer) {
    this.st.layer = layer;
    if (layer !== 'base') this.st.showOver = true;
    if (layer !== 'over') this.st.showBase = true;
    this.applyVis();
    this.buildDecor();
    this.dirty = true;
    this.refreshToolUI();
  }

  applyVis() {
    const st = this.st;
    this.model.setLayers(st.showBase, st.showOver);
    this.model.overMat.opacity = st.layer === 'base' ? 0.4 : 1;
    for (const id in st.parts) this.model.setPartVisible(id, st.parts[id]);
    $('#vis-base').innerHTML = icon(st.showBase ? 'eye' : 'eyeOff', 2);
    $('#vis-over').innerHTML = icon(st.showOver ? 'eye' : 'eyeOff', 2);
    $('#vis-base').classList.toggle('off', !st.showBase);
    $('#vis-over').classList.toggle('off', !st.showOver);
    $$('.mb-part').forEach((el) => el.classList.toggle('off', !st.parts[el.dataset.part]));
    this.hoverT = -2;
  }

  setModelType(model) {
    if (!this.doc || this.doc.model === model) return;
    this.doc.model = model;
    this.applyModel();
    for (const id of ['rightArm', 'leftArm']) {
      const p = new THREE.Vector3();
      this.model.parts[id].base.getWorldPosition(p);
      this.world.burst(p, ['#ffffff', '#cfc8ff', this.st.color], 10, { speed: 10, up: 6, size: 0.8, life: 0.5 });
    }
    sfx.pop();
    this.scheduleSave();
  }

  applyModel() {
    const slim = this.doc.model === 'slim';
    this.info = texelInfo(slim);
    this.model.build(slim);
    this.applyVis();
    this.buildDecor();
    this.refreshToolUI();
    this.dirty = true;
  }

  // ---------- Open / close / save ----------
  async open(skin) {
    const c = normalizeSkin(await loadImage(b64ToSrc(skin.png)));
    this.px.set(c.getContext('2d').getImageData(0, 0, 64, 64).data);
    this.sctx.putImageData(this.img, 0, 0);
    this.doc = { id: skin.id, model: skin.model === 'slim' ? 'slim' : 'classic' };
    this.lastId = skin.id;
    $('#ed-name').value = skin.name;
    this.undoStack = [];
    this.redoStack = [];
    this.refreshUndo();
    this.st.layer = 'base';
    this.applyModel();
    this.setSaveState('saved');
    this.orbit.theta = 2.2; this.orbit.phi = 1.15; this.orbit.dist = 78;
    this.resetView();
    this.active = true;
    this.el.classList.remove('hidden');
    this.world.setMode('editor');
    this.updateViewOffset();
    this.entT = 0;
    this.landed = false;
    this.hoverT = -2;
  }

  async close() {
    if (this.saveTimer) await this.saveNow();
    this.endStroke();
    this.active = false;
    this.setHover(-1);
    this.el.classList.add('hidden');
    this.world.renderer.domElement.style.cursor = '';
  }

  flush() {
    if (this.saveTimer) this.saveNow();
  }

  setSaveState(s) {
    const el = $('#save-state');
    el.className = 'save-state ' + s;
    el.innerHTML = s === 'saving' ? '<i class="spin"></i><span>Saving…</span>' : s === 'error' ? '<span>Not saved!</span>' : icon('check', 2) + '<span>Saved</span>';
  }

  scheduleSave() {
    this.setSaveState('saving');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 700);
  }

  async saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.doc) return;
    const name = $('#ed-name').value.trim() || 'Untitled';
    try {
      await api.save({ id: this.doc.id, name, model: this.doc.model, png: canvasToB64(this.skin) });
      this.setSaveState('saved');
    } catch (e) {
      this.setSaveState('error');
      toast('Save failed', e.message, 'trash', 'bad');
    }
  }

  async exportPng() {
    await this.saveNow();
    try {
      const ok = await api.exportFile($('#ed-name').value.trim() || 'skin', canvasToB64(this.skin));
      if (ok) { sfx.levelup(); toast('Skin exported!', 'Ready to upload to Minecraft', 'download'); }
    } catch (e) {
      sfx.error();
      toast('Export failed', e.message, 'trash', 'bad');
    }
  }

  // ---------- Pixels ----------
  commitPixels() {
    this.sctx.putImageData(this.img, 0, 0);
    this.dirty = true;
  }

  brush(t) {
    const fi = this.info.faceOf[t];
    if (fi < 0) return [];
    const [rx, ry, rw, rh] = this.info.faces[fi].rect;
    const x0 = t % 64, y0 = (t / 64) | 0, n = this.st.size, o = (n - 1) >> 1;
    const out = [];
    for (let dy = 0; dy < n; dy++)
      for (let dx = 0; dx < n; dx++) {
        const x = x0 - o + dx, y = y0 - o + dy;
        if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) out.push(y * 64 + x);
      }
    return out;
  }

  withMirror(list) {
    if (!this.st.mirror) return list;
    const out = [...list];
    for (const t of list) {
      const m = this.info.mirror[t];
      if (m >= 0 && !out.includes(m)) out.push(m);
    }
    return out;
  }

  beginStroke() {
    this.stroke = { snap: this.px.slice(), touched: new Set(), changed: false, last: -1 };
    if (['pencil', 'noise', 'fill'].includes(this.st.tool)) this.pushRecent(this.st.color);
  }

  strokeAt(t, point) {
    const s = this.stroke;
    if (!s) return;
    if (this.st.tool === 'fill') {
      if (s.last !== -1) return;
      s.last = t;
      let changed = false;
      for (const start of this.withMirror([t])) {
        if (this.st.fillMode === 'area') changed = this.flood(start) || changed;
        else for (const x of this.fillScope(start)) changed = this.setOpaque(x) || changed;
      }
      if (changed) {
        s.changed = true;
        this.commitPixels();
        sfx.fill();
        if (point) this.world.burst(point, this.st.color, 14, { speed: 16, up: 10, size: 0.8, life: 0.6 });
      }
      return;
    }
    const pts = s.last >= 0 && this.info.faceOf[s.last] === this.info.faceOf[t] ? line(s.last, t) : [t];
    s.last = t;
    let changed = false;
    for (const p of pts) for (const b of this.withMirror(this.brush(p))) changed = this.paintTexel(b) || changed;
    if (!changed) return;
    s.changed = true;
    this.commitPixels();
    const now = performance.now();
    if (point && now - this.fxAt > 45) {
      this.fxAt = now;
      const col = this.st.tool === 'eraser' ? ['#ffffff', '#bbbbbb'] : this.st.tool === 'shade' ? ['#222', '#eee'] : this.st.color;
      this.world.burst(point, col, 3, { speed: 7, up: 8, size: 0.6, life: 0.45 });
    }
    if (now - this.sndAt > 70) {
      this.sndAt = now;
      this.st.tool === 'eraser' ? sfx.erase() : sfx.pop();
    }
  }

  endStroke() {
    const s = this.stroke;
    this.stroke = null;
    if (!s || !s.changed) return;
    this.undoStack.push(s.snap);
    if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
    this.redoStack.length = 0;
    this.refreshUndo();
    this.scheduleSave();
  }

  paintTexel(t) {
    const s = this.stroke;
    if (s.touched.has(t)) return false;
    s.touched.add(t);
    const px = this.px, i = t * 4, [r, g, b] = this.rgb, k = this.st.strength / 100;
    let c;
    switch (this.st.tool) {
      case 'pencil': c = [r, g, b, 255]; break;
      case 'eraser': if (px[i + 3] === 0) return false; c = [0, 0, 0, 0]; break;
      case 'noise': { const f = 1 + (Math.random() * 2 - 1) * k * 1.4; c = [r * f, g * f, b * f, 255]; break; }
      case 'shade':
        if (px[i + 3] === 0) return false;
        c = this.shift
          ? [px[i] + (255 - px[i]) * k, px[i + 1] + (255 - px[i + 1]) * k, px[i + 2] + (255 - px[i + 2]) * k, px[i + 3]]
          : [px[i] * (1 - k), px[i + 1] * (1 - k), px[i + 2] * (1 - k), px[i + 3]];
        break;
      default: return false;
    }
    c = c.map((v) => clamp(Math.round(v), 0, 255));
    if (px[i] === c[0] && px[i + 1] === c[1] && px[i + 2] === c[2] && px[i + 3] === c[3]) return false;
    px.set(c, i);
    return true;
  }

  fillScope(t) {
    const { faces, faceOf } = this.info;
    const f = faces[faceOf[t]];
    if (!f) return [];
    const mode = this.st.fillMode;
    const list = mode === 'face' ? [f]
      : faces.filter((g) => g.layer === f.layer && (mode === 'all' ? this.st.parts[g.part] : g.part === f.part));
    const out = [];
    for (const g of list) {
      const [rx, ry, rw, rh] = g.rect;
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) out.push(y * 64 + x);
    }
    return out;
  }

  setOpaque(t) {
    const px = this.px, i = t * 4, [r, g, b] = this.rgb;
    if (px[i] === r && px[i + 1] === g && px[i + 2] === b && px[i + 3] === 255) return false;
    px.set([r, g, b, 255], i);
    return true;
  }

  flood(start) {
    const fi = this.info.faceOf[start];
    if (fi < 0) return false;
    const [rx, ry, rw, rh] = this.info.faces[fi].rect;
    const px = this.px, i0 = start * 4;
    const tr = px[i0], tg = px[i0 + 1], tb = px[i0 + 2], ta = px[i0 + 3];
    const [r, g, b] = this.rgb;
    if (ta === 255 && tr === r && tg === g && tb === b) return false;
    const same = (t) => {
      const i = t * 4;
      return ta === 0 ? px[i + 3] === 0 : px[i] === tr && px[i + 1] === tg && px[i + 2] === tb && px[i + 3] === ta;
    };
    const stack = [start], seen = new Set(stack);
    while (stack.length) {
      const t = stack.pop();
      px.set([r, g, b, 255], t * 4);
      const x = t % 64, y = (t / 64) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < rx || nx >= rx + rw || ny < ry || ny >= ry + rh) continue;
        const n = ny * 64 + nx;
        if (!seen.has(n) && same(n)) { seen.add(n); stack.push(n); }
      }
    }
    return true;
  }

  pickColor(t) {
    const i = t * 4;
    if (this.px[i + 3] === 0) { sfx.error(); return; }
    this.setColor(rgbToHex(this.px[i], this.px[i + 1], this.px[i + 2]));
    sfx.pick();
    if (this.st.tool === 'picker' && this.prevTool) this.setTool(this.prevTool);
  }

  refreshUndo() {
    $('#ed-undo').disabled = !this.undoStack.length;
    $('#ed-redo').disabled = !this.redoStack.length;
  }

  undo() {
    if (!this.undoStack.length || this.stroke) return;
    this.redoStack.push(this.px.slice());
    this.px.set(this.undoStack.pop());
    this.afterHistory();
  }

  redo() {
    if (!this.redoStack.length || this.stroke) return;
    this.undoStack.push(this.px.slice());
    this.px.set(this.redoStack.pop());
    this.afterHistory();
  }

  afterHistory() {
    this.commitPixels();
    this.refreshUndo();
    this.scheduleSave();
    this.squish = 1;
  }

  // ---------- Display textures ----------
  rebuildDisplay() {
    const d = this.dimg.data, px = this.px, mask = this.info.mask;
    const editOver = this.st.layer === 'over', grid = this.st.grid;
    for (let Y = 0; Y < 512; Y++) {
      const ty = Y >> 3, gy = (Y & 7) === 0;
      for (let X = 0; X < 512; X++) {
        const tx = X >> 3, t = ty * 64 + tx, i = t * 4, o = (Y * 512 + X) * 4;
        const line = grid && (gy || (X & 7) === 0);
        const m = mask[t];
        let r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
        if (a > 0) {
          if (m === 1) a = 255;
          if (line) { r *= 0.78; g *= 0.78; b *= 0.78; }
        } else if (m === 2 && editOver) {
          r = g = b = 255;
          a = line ? 80 : 30;
        } else if (m === 1 && !editOver) {
          r = g = b = ((X >> 2) + (Y >> 2)) & 1 ? 105 : 150;
          a = 255;
        } else {
          a = 0;
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
      }
    }
  }

  mark(ctx, t, alpha, big = false) {
    const x = (t % 64) * 8, y = ((t / 64) | 0) * 8;
    const tool = this.st.tool;
    if (tool === 'pencil' || tool === 'noise' || tool === 'fill') {
      ctx.globalAlpha = (big ? 0.6 : 0.7) * alpha;
      ctx.fillStyle = this.st.color;
      ctx.fillRect(x, y, 8, 8);
    }
    if (big) { ctx.globalAlpha = 1; return; }
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    ctx.strokeStyle = tool === 'eraser' ? '#ff5a5a' : '#ffffff';
    ctx.strokeRect(x + 1, y + 1, 6, 6);
    ctx.globalAlpha = 1;
  }

  drawDisplay() {
    this.dctx.putImageData(this.dimg, 0, 0);
    const big = this.hover.length > 9;
    for (const t of this.hover) this.mark(this.dctx, t, 1, big);
    for (const t of this.hoverMirror) this.mark(this.dctx, t, 0.5, big);
    this.tex.needsUpdate = true;
  }

  buildDecor() {
    const c = this.decor.getContext('2d');
    c.clearRect(0, 0, 512, 512);
    const { mask, faces } = this.info;
    const act = { base: 1, over: 2, all: 0 }[this.st.layer];
    for (let t = 0; t < 4096; t++) {
      const x = (t % 64) * 8, y = ((t / 64) | 0) * 8;
      if (mask[t] === 0) { c.fillStyle = 'rgba(12,11,18,0.94)'; c.fillRect(x, y, 8, 8); }
      else if (act && mask[t] !== act) { c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x, y, 8, 8); }
    }
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 0; i <= 64; i++) { c.fillRect(i * 8, 0, 1, 512); c.fillRect(0, i * 8, 512, 1); }
    c.lineWidth = 1;
    for (const f of faces) {
      const [rx, ry, rw, rh] = f.rect;
      c.strokeStyle = !act || f.layer === this.st.layer ?'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)';
      c.strokeRect(rx * 8 + 0.5, ry * 8 + 0.5, rw * 8 - 1, rh * 8 - 1);
    }
  }

  draw2D() {
    const c = this.ctx2d;
    c.imageSmoothingEnabled = false;
    c.drawImage(this.checker, 0, 0);
    c.drawImage(this.skin, 0, 0, 512, 512);
    c.drawImage(this.decor, 0, 0);
    const big = this.hover.length > 9;
    for (const t of this.hover) this.mark(c, t, 1, big);
    for (const t of this.hoverMirror) this.mark(c, t, 0.5, big);
  }

  setHover(t) {
    if (t === this.hoverT) return;
    this.hoverT = t;
    const hud = $('#ed-hud');
    if (t < 0 || !this.info || this.info.faceOf[t] < 0) {
      this.hover = [];
      this.hoverMirror = [];
      hud.textContent = HINT;
      hud.classList.add('on', 'dim');
    } else {
      const tool = this.st.tool;
      const main = tool === 'picker' || (tool === 'fill' && this.st.fillMode === 'area') ? [t]
        : tool === 'fill' ? this.fillScope(t) : this.brush(t);
      this.hover = main;
      const own = new Set(main);
      this.hoverMirror = this.st.mirror ? main.map((x) => this.info.mirror[x]).filter((x) => x >= 0 && !own.has(x)) : [];
      const f = this.info.faces[this.info.faceOf[t]];
      hud.innerHTML = `<b>${PART_LABEL[f.part]}</b> · ${cap(f.face)} · ${f.layer === 'over' ? 'Overlay' : 'Base'} <span>${t % 64}, ${(t / 64) | 0}</span>`;
      hud.classList.add('on');
      hud.classList.remove('dim');
    }
    this.hoverDirty = true;
  }

  // ---------- Input ----------
  pick3D(e, anyLayer = false) {
    const r = this.world.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.world.camera);
    const layer = this.st.layer;
    const pool = anyLayer || layer === 'all' ? [...this.model.baseMeshes, ...this.model.overMeshes]
      : layer === 'base' ? this.model.baseMeshes : this.model.overMeshes;
    const meshes = pool.filter((m) => m.visible && m.parent.visible);
    for (const hit of this.ray.intersectObjects(meshes, false)) {
      const rect = hit.object.geometry.userData.rects[hit.faceIndex >> 1];
      const tx = clamp(Math.floor(hit.uv.x * 64), rect[0], rect[0] + rect[2] - 1);
      const ty = clamp(Math.floor((1 - hit.uv.y) * 64), rect[1], rect[1] + rect[3] - 1);
      const t = ty * 64 + tx;
      // In "All" mode, see-through overlay pixels let the click reach the base layer behind them.
      if (!anyLayer && layer === 'all' && hit.object.userData.layer === 'over' && this.px[t * 4 + 3] === 0) continue;
      return { t, point: hit.point.clone() };
    }
    return null;
  }

  bindPointer() {
    const cv = this.world.renderer.domElement;
    const o = this.orbit;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    const pointers = new Map();
    const twoFinger = () => {
      const [a, b] = [...pointers.values()];
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
    };
    const orbitBy = (dx, dy) => {
      o.tTheta -= dx * 0.009;
      o.tPhi = clamp(o.tPhi - dy * 0.009, 0.12, Math.PI - 0.12);
    };
    cv.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      if (document.activeElement?.matches('input')) document.activeElement.blur();
      const sheet = $('#ed-side');
      if (sheet.classList.contains('open')) { sheet.classList.remove('open'); return; }
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        // A second finger means pinch/rotate: undo whatever the first finger just started painting.
        if (this.drag === 'paint' && this.stroke) {
          this.px.set(this.stroke.snap);
          this.stroke = null;
          this.commitPixels();
        }
        this.drag = 'pinch';
        this.pinch = twoFinger();
        return;
      }
      if (pointers.size > 2) return;
      this.shift = e.shiftKey;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (e.button === 0) {
        const hit = this.pick3D(e);
        if (hit) {
          if (e.altKey || this.st.tool === 'picker') { this.pickColor(hit.t); this.drag = 'none'; return; }
          this.beginStroke();
          this.strokeAt(hit.t, hit.point);
          this.drag = 'paint';
          return;
        }
      }
      this.drag = e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
      cv.style.cursor = 'grabbing';
      this.setHover(-1);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.drag === 'pinch') {
        if (pointers.size < 2) return;
        const p = twoFinger();
        o.tDist = clamp(o.tDist * (this.pinch.dist / p.dist), 14, this.maxDist());
        orbitBy(p.cx - this.pinch.cx, p.cy - this.pinch.cy);
        this.pinch = p;
        return;
      }
      this.shift = e.shiftKey;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (this.drag === 'orbit') {
        orbitBy(dx, dy);
      } else if (this.drag === 'pan') {
        const cam = this.world.camera;
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
        const k = o.dist * 0.0017;
        o.tTarget.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
        o.tTarget.set(clamp(o.tTarget.x, -16, 16), clamp(o.tTarget.y, 0, 34), clamp(o.tTarget.z, -16, 16));
      } else if (this.drag === 'paint') {
        const hit = this.pick3D(e);
        if (hit) { this.strokeAt(hit.t, hit.point); if (e.pointerType === 'mouse') this.setHover(hit.t); }
      } else if (!this.drag && e.pointerType === 'mouse') {
        const hit = this.pick3D(e);
        this.setHover(hit ? hit.t : -1);
        cv.style.cursor = hit ? 'crosshair' : 'grab';
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (this.drag === 'pinch') {
        // Stay in pinch mode until every finger lifts, so the last finger doesn't start painting.
        if (pointers.size === 0) this.drag = null;
        return;
      }
      if (this.drag === 'paint') this.endStroke();
      if (this.drag) cv.style.cursor = 'grab';
      this.drag = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', (e) => { if (!this.drag && e.pointerType === 'mouse') this.setHover(-1); });
    cv.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      const old = o.tDist;
      o.tDist = clamp(old * Math.pow(1.0013, e.deltaY), 14, this.maxDist());
      if (o.tDist < old) {
        // Zoom toward whatever is under the cursor so it stays in view.
        const hit = this.pick3D(e, true);
        if (hit) o.tTarget.lerp(hit.point, 1 - o.tDist / old);
      } else if (o.tDist > old) {
        o.tTarget.lerp(CENTER, Math.min(1, ((o.tDist - old) / Math.max(1, this.maxDist() - old)) * 1.2));
      }
      o.tTarget.set(clamp(o.tTarget.x, -16, 16), clamp(o.tTarget.y, -2, 34), clamp(o.tTarget.z, -16, 16));
    }, { passive: false });

    const c2 = $('#ed-2d');
    const texAt = (e) => {
      const r = c2.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * 64), y = Math.floor(((e.clientY - r.top) / r.height) * 64);
      if (x < 0 || x > 63 || y < 0 || y > 63) return -1;
      const t = y * 64 + x;
      return this.info.mask[t] ? t : -1;
    };
    c2.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const t = texAt(e);
      if (t < 0) return;
      this.shift = e.shiftKey;
      c2.setPointerCapture(e.pointerId);
      if (e.altKey || this.st.tool === 'picker') { this.pickColor(t); return; }
      this.beginStroke();
      this.strokeAt(t, null);
      this.paint2d = true;
    });
    c2.addEventListener('pointermove', (e) => {
      this.shift = e.shiftKey;
      const t = texAt(e);
      this.setHover(t);
      if (this.paint2d && t >= 0) this.strokeAt(t, null);
    });
    const end2 = () => { if (this.paint2d) { this.paint2d = false; this.endStroke(); } };
    c2.addEventListener('pointerup', end2);
    c2.addEventListener('pointercancel', end2);
    c2.addEventListener('pointerleave', () => { if (!this.paint2d) this.setHover(-1); });
  }

  bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (!this.active || document.querySelector('.modal-back')) return;
      if (e.target.matches('input:not([type=range])')) {
        if (e.key === 'Enter' || e.key === 'Escape') e.target.blur();
        return;
      }
      // Physical key position, so shortcuts also work with an Arabic keyboard layout.
      const k = keyOf(e);
      if (e.ctrlKey || e.metaKey) {
        if (k === 'z' && !e.shiftKey) this.undo();
        else if (k === 'y' || (k === 'z' && e.shiftKey)) this.redo();
        else if (k === 's') this.saveNow().then(() => { sfx.chime(); toast('Saved!', 'Your skin is safe', 'check'); });
        else if (k === 'e') this.exportPng();
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey) { e.preventDefault(); return; }
      const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
      if (tool) return this.setTool(tool.id);
      if (k === '1' || k === '2' || k === '3') return this.setSize(+k);
      if (k === 'm') return this.toggleMirror();
      if (k === 'l') return this.toggleGrid();
      if (k === 'x') return this.setLayer({ base: 'over', over: 'all', all: 'base' }[this.st.layer]);
      if (k === 'r') return this.resetView();
      if (k === 'f') return this.setView(0);
      if (k === 'escape') return this.onBack?.();
    });
  }

  // ---------- Camera ----------
  angleTo(a) {
    const d = (((a - this.orbit.tTheta) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return d;
  }

  setView(a) {
    this.orbit.tTheta += this.angleTo(a);
    this.orbit.tPhi = Math.PI / 2 - 0.12;
  }

  resetView() {
    const o = this.orbit;
    o.tTheta = o.theta + ((((DEFAULT_VIEW.theta - o.theta) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    o.tPhi = DEFAULT_VIEW.phi;
    o.tDist = this.fitDist();
    o.tTarget.set(0, 16, 0);
  }

  // Narrow (portrait phone) screens need the camera further back so the whole model fits across.
  fitDist() {
    const halfTan = Math.tan((this.world.camera.fov * Math.PI) / 360);
    return Math.max(DEFAULT_VIEW.dist, 17 / (halfTan * (innerWidth / innerHeight)));
  }

  maxDist() {
    return Math.max(68, this.fitDist() * 1.2);
  }

  updateViewOffset() {
    const W = innerWidth, H = innerHeight;
    const tools = $('#ed-tools'), side = $('#ed-side'), top = $('.topbar'), viewbar = $('#ed-viewbar');
    const topH = top.offsetTop + top.offsetHeight;
    if (matchMedia('(max-width: 760px)').matches) {
      // Phone layout: bars sit above and below the model, side panel is a pull-up sheet.
      const bottomH = H - Math.min(tools.getBoundingClientRect().top, viewbar.getBoundingClientRect().top);
      this.world.camera.setViewOffset(W, H, 0, (bottomH - topH) / 2, W, H);
      return;
    }
    const left = tools.offsetLeft + tools.offsetWidth;
    const right = W - side.offsetLeft;
    this.world.camera.setViewOffset(W, H, (right - left) / 2, (70 - topH) / 2, W, H);
  }

  // ---------- Frame ----------
  update(dt) {
    this.time += dt;
    const o = this.orbit, k = 1 - Math.exp(-dt * 10);
    o.theta += (o.tTheta - o.theta) * k;
    o.phi += (o.tPhi - o.phi) * k;
    o.dist += (o.tDist - o.dist) * k;
    o.target.lerp(o.tTarget, k);
    const cam = this.world.camera;
    cam.position.set(
      o.target.x + o.dist * Math.sin(o.phi) * Math.sin(o.theta),
      o.target.y + o.dist * Math.cos(o.phi),
      o.target.z + o.dist * Math.sin(o.phi) * Math.cos(o.theta),
    );
    cam.lookAt(o.target);
    this.fadeStage(clamp(cam.position.y / 4, 0, 1));
    this.model.update(dt, this.st.pose, this.time);
    this.animateEntrance(dt);

    if (this.hoverT === -2) this.setHover(-1);
    if (this.dirty) { this.rebuildDisplay(); this.dirty = false; this.hoverDirty = true; }
    if (this.hoverDirty) { this.drawDisplay(); this.draw2D(); this.hoverDirty = false; }
  }

  // The grass block would hide the model when the camera looks from below, so fade it out.
  fadeStage(k) {
    const { pedestal, shadow } = this.world;
    if (this.stageFade === k) return;
    this.stageFade = k;
    for (const m of new Set(pedestal.material)) {
      m.transparent = k < 1;
      m.opacity = k;
      m.depthWrite = k >= 1;
    }
    shadow.material.opacity = k;
    pedestal.visible = shadow.visible = k > 0.02;
  }

  animateEntrance(dt) {
    const root = this.model.root, ped = this.world.pedestal, shadow = this.world.shadow;
    if (this.squish > 0) {
      this.squish = Math.max(0, this.squish - dt * 3);
      const s = Math.sin(this.squish * Math.PI) * 0.06;
      root.scale.set(1 + s, 1 - s, 1 + s);
    }
    if (this.entT === null) return;
    const T = (this.entT += dt);
    let y = 0, sq = 0, rot = 0;
    if (T < 0.5) {
      const a = T / 0.5;
      y = 46 * (1 - a * a);
      rot = -(1 - a) * (1 - a) * Math.PI * 2;
      sq = -0.06;
    } else {
      if (!this.landed) {
        this.landed = true;
        sfx.land();
        this.world.burst(new THREE.Vector3(0, 0.6, 0), ['#5f9e35', '#79bd48', '#866043', '#9b9ba3'], 26, { speed: 24, up: 13, size: 1.1, life: 0.8 });
      }
      const u = T - 0.5;
      y = u < 0.3 ? 3.5 * Math.sin((Math.PI * u) / 0.3) : 0;
      sq = 0.2 * Math.exp(-u * 7) * Math.cos(u * 17);
    }
    root.position.y = y;
    root.rotation.y = rot;
    root.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    ped.scale.setScalar(Math.max(0.001, elastic(Math.min(1, T / 0.55))));
    shadow.scale.setScalar(clamp(1 - y / 50, 0.25, 1));
    if (T > 1.6) {
      this.entT = null;
      root.position.y = 0;
      root.rotation.y = 0;
      root.scale.set(1, 1, 1);
      ped.scale.setScalar(1);
      shadow.scale.setScalar(1);
    }
  }
}
