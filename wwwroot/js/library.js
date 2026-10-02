import * as THREE from './three.module.min.js';
import { PlayerModel } from './model.js';
import { api } from './bridge.js';
import { $, $$, h, icon, modal, toast, sfx, pixelBurst, timeAgo, keyOf } from './ui.js';
import { makeDefaultSkin, normalizeSkin, loadImage, detectSlim, canvasToB64, b64ToSrc } from './skin.js';

const TW = 300, TH = 380;
const DEF_ANGLE = -0.45;
const SPLASH = [
  'Now in 3D!', 'Pixel perfect!', '64×64 of pure art!', 'Mirror mode!', 'Made by you!', 'Hand-crafted!',
  'Not a creeper!', 'Blocky & proud!', 'Try the dance pose!', 'Stay blocky!', 'Squares are cool!',
  'Undo is your friend!', 'Also try noise brush!', '100% pixels!', 'Fresh skins daily!', 'Ctrl+Z saves lives!',
];

class Thumbs {
  constructor() {
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.r.setPixelRatio(1);
    this.r.setSize(TW, TH, false);
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, TW / TH, 1, 300);
    this.cam.position.set(0, 19, 72);
    this.cam.lookAt(0, 16, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const d = new THREE.DirectionalLight(0xffffff, 0.62);
    d.position.set(30, 45, 60);
    this.scene.add(d);
    this.models = { classic: new PlayerModel(), slim: new PlayerModel() };
    this.models.classic.build(false);
    this.models.slim.build(true);
    for (const m of Object.values(this.models)) {
      m.parts.rightArm.pivot.rotation.z = -0.08;
      m.parts.leftArm.pivot.rotation.z = 0.08;
      m.parts.head.pivot.rotation.y = 0.15;
      this.scene.add(m.root);
    }
  }

  draw(canvas, entry, angle) {
    const slim = entry.model === 'slim';
    const m = slim ? this.models.slim : this.models.classic;
    this.models.classic.root.visible = !slim;
    this.models.slim.root.visible = slim;
    m.setMap(entry.tex);
    m.root.rotation.y = angle;
    this.r.render(this.scene, this.cam);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.r.domElement, 0, 0, canvas.width, canvas.height);
  }
}

const figure = (v) => `<div class="fig ${v}"><i class="h"></i><i class="ra"></i><i class="b"></i><i class="la"></i><i class="rl"></i><i class="ll"></i></div>`;

const readFile = (f) => new Promise((res) => {
  const fr = new FileReader();
  fr.onload = () => res({ name: f.name.replace(/\.png$/i, ''), png: String(fr.result).split(',')[1] });
  fr.readAsDataURL(f);
});

export class Library {
  constructor(world) {
    this.world = world;
    this.el = $('#screen-library');
    this.grid = $('#skin-grid');
    this.skins = [];
    this.cache = new Map();
    this.spin = new Map();
    this.thumbs = new Thumbs();
    this.onOpen = null;

    const logo = $('#logo');
    const word = (text, cls, offset) => h('span', { class: 'word ' + cls }, ...[...text].map((ch, i) => h('span', { class: 'ch', style: `--i:${i + offset}`, text: ch })));
    logo.append(word('SKIN', 'w1', 0), word('CRAFT', 'w2', 4));
    const splash = $('#splash');
    const newSplash = () => {
      splash.textContent = SPLASH[(Math.random() * SPLASH.length) | 0];
      splash.classList.remove('hop');
      void splash.offsetWidth;
      splash.classList.add('hop');
    };
    newSplash();
    splash.onclick = () => { sfx.pop(); newSplash(); };

    $('#btn-new').innerHTML = icon('plus', 2) + '<span>New Skin</span>';
    $('#btn-import').innerHTML = icon('upload', 2) + '<span>Import PNG</span>';
    $('#btn-fetch').innerHTML = icon('player', 2) + '<span>Get Player Skin</span>';
    $('#btn-folder').innerHTML = icon('folder', 2);
    $('#lib-search-ico').innerHTML = icon('search', 2);
    $('#empty-ico').innerHTML = icon('brush', 5);
    $('#btn-new').onclick = () => this.newSkin();
    $('#btn-empty-new').onclick = () => this.newSkin();
    $('#btn-import').onclick = () => this.importFiles();
    $('#btn-fetch').onclick = () => this.fetchPlayer();
    $('#btn-folder').onclick = () => api.openFolder();
    $('#lib-search').addEventListener('input', () => this.render());

    document.addEventListener('keydown', (e) => {
      if (this.el.classList.contains('hidden') || document.querySelector('.modal-back')) return;
      if ((e.ctrlKey || e.metaKey) && keyOf(e) === 'n') { e.preventDefault(); this.newSkin(); }
      if ((e.ctrlKey || e.metaKey) && keyOf(e) === 'f') { e.preventDefault(); $('#lib-search').focus(); }
    });

    const drop = $('#drop-hint');
    let depth = 0;
    window.addEventListener('dragenter', (e) => { e.preventDefault(); if (!this.el.classList.contains('hidden')) { depth++; drop.classList.add('on'); } });
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.classList.remove('on'); } });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0;
      drop.classList.remove('on');
      if (this.el.classList.contains('hidden')) return;
      const files = [...e.dataTransfer.files].filter((f) => /\.png$/i.test(f.name));
      if (files.length) this.importList(await Promise.all(files.map(readFile)));
    });
  }

  async refresh(highlightId) {
    let list = [];
    try { list = await api.list(); } catch (e) { toast('Could not load skins', e.message, 'trash', 'bad'); }
    list.sort((a, b) => b.modified - a.modified);
    const ok = [];
    for (const s of list) {
      try { await this.entry(s); ok.push(s); } catch {}
    }
    this.skins = ok;
    this.render(highlightId);
  }

  async entry(s) {
    const key = s.id + ':' + s.modified;
    let e = this.cache.get(s.id);
    if (e && e.key === key) { e.model = s.model; return e; }
    const canvas = normalizeSkin(await loadImage(b64ToSrc(s.png)));
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    e?.tex.dispose();
    e = { key, tex, canvas, model: s.model };
    this.cache.set(s.id, e);
    return e;
  }

  render(highlightId) {
    this.grid.innerHTML = '';
    this.spin.clear();
    const q = $('#lib-search').value.trim().toLowerCase();
    const list = this.skins.filter((s) => !q || s.name.toLowerCase().includes(q));
    const n = this.skins.length;
    $('#lib-count').textContent = `${n} skin${n === 1 ? '' : 's'}`;
    $('#lib-empty').classList.toggle('hidden', n > 0);
    $('#lib-bar').classList.toggle('hidden', n === 0);
    $('#lib-nores').classList.toggle('hidden', !(n > 0 && list.length === 0));
    list.forEach((s, i) => {
      const e = this.cache.get(s.id);
      const cv = h('canvas', { class: 'thumb', width: TW, height: TH });
      const card = h('div', { class: 'card panel' + (s.id === highlightId ? ' fresh' : ''), style: `--i:${Math.min(i, 24)}` },
        h('div', { class: 'thumb-wrap' }, cv, h('div', { class: 'badge', text: s.model === 'slim' ? 'SLIM' : 'CLASSIC' })),
        h('div', { class: 'card-name', text: s.name, dir: 'auto' }),
        h('div', { class: 'card-meta', text: 'Edited ' + timeAgo(s.modified) }),
      );
      card.append(h('div', { class: 'card-tools' },
        this.toolBtn('pencil', 'Rename', () => this.rename(s)),
        this.toolBtn('copy', 'Duplicate', () => this.duplicate(s)),
        this.toolBtn('download', 'Export PNG', () => this.exportSkin(s)),
        this.toolBtn('trash', 'Delete', () => this.remove(s, card), 'red'),
      ));
      card.onclick = (ev) => { if (!ev.target.closest('.card-tools')) this.onOpen?.(s); };
      card.onmouseenter = () => {
        const sp = this.spin.get(card) || { e, cv, angle: DEF_ANGLE };
        sp.hover = true;
        this.spin.set(card, sp);
      };
      card.onmouseleave = () => { const sp = this.spin.get(card); if (sp) sp.hover = false; };
      this.grid.append(card);
      this.thumbs.draw(cv, e, DEF_ANGLE);
    });
    if (highlightId) $('.card.fresh', this.grid)?.scrollIntoView({ block: 'nearest' });
  }

  toolBtn(ic, tip, fn, kind = '') {
    const b = h('button', { class: `mc-btn icon xs ${kind}`, 'data-tip': tip, html: icon(ic, 2) });
    b.onclick = (ev) => { ev.stopPropagation(); fn(); };
    return b;
  }

  update(dt) {
    for (const [card, sp] of this.spin) {
      if (sp.hover) {
        sp.angle += dt * 2.4;
      } else {
        const target = DEF_ANGLE + Math.round((sp.angle - DEF_ANGLE) / (Math.PI * 2)) * Math.PI * 2;
        sp.angle += (target - sp.angle) * (1 - Math.exp(-dt * 7));
        if (Math.abs(target - sp.angle) < 0.003) {
          this.thumbs.draw(sp.cv, sp.e, DEF_ANGLE);
          this.spin.delete(card);
          continue;
        }
      }
      this.thumbs.draw(sp.cv, sp.e, sp.angle);
    }
  }

  async newSkin() {
    let model = 'classic';
    const n = this.skins.length + 1;
    const input = h('input', { class: 'mc-input', maxlength: 40, value: `My Skin ${n}`, spellcheck: 'false', dir: 'auto' });
    const pick = h('div', { class: 'model-pick' });
    for (const v of ['classic', 'slim']) {
      const b = h('button', {
        class: 'model-opt' + (v === model ? ' active' : ''),
        html: figure(v) + `<b>${v === 'slim' ? 'Slim' : 'Classic'}</b><small>${v === 'slim' ? '3px arms' : '4px arms'}</small>`,
      });
      b.onclick = () => { model = v; $$('.model-opt', pick).forEach((x) => x.classList.toggle('active', x === b)); };
      pick.append(b);
    }
    const body = h('div', {},
      h('label', { class: 'field' }, h('span', { text: 'Name' }), input),
      h('div', { class: 'field' }, h('span', { text: 'Model' }), pick),
    );
    const res = await modal({
      title: 'New Skin', body,
      actions: [{ label: 'Cancel' }, { label: 'Create', kind: 'green', icon: 'plus', primary: true, value: 'ok' }],
      onOpen: () => { input.focus(); input.select(); },
    });
    if (res !== 'ok') return;
    const c = makeDefaultSkin(model === 'slim');
    const png = canvasToB64(c);
    try {
      const meta = await api.save({ name: input.value.trim() || `My Skin ${n}`, model, png });
      sfx.levelup();
      if (this.skins.length === 0) setTimeout(() => toast('Advancement Made!', 'Your First Skin', 'star'), 1400);
      this.onOpen?.({ ...meta, png });
    } catch (e) {
      sfx.error();
      toast('Could not create skin', e.message, 'trash', 'bad');
    }
  }

  async importFiles() {
    try { await this.importList(await api.importFile()); } catch (e) { toast('Import failed', e.message, 'trash', 'bad'); }
  }

  async importList(files) {
    let lastId = null, count = 0;
    for (const f of files) {
      try {
        const c = normalizeSkin(await loadImage(b64ToSrc(f.png)));
        const meta = await api.save({ name: f.name, model: detectSlim(c) ? 'slim' : 'classic', png: canvasToB64(c) });
        lastId = meta.id;
        count++;
      } catch (e) {
        sfx.error();
        toast('Import failed', `${f.name}: ${e.message}`, 'trash', 'bad');
      }
    }
    if (!count) return;
    sfx.chime();
    toast(count === 1 ? 'Skin imported!' : `${count} skins imported!`, 'Added to your library', 'upload');
    await this.refresh(lastId);
  }

  async fetchPlayer() {
    const input = h('input', { class: 'mc-input', maxlength: 16, spellcheck: 'false', dir: 'auto', placeholder: 'e.g. Notch' });
    const err = h('div', { class: 'form-error' });
    const body = h('div', {},
      h('p', { class: 'hint', text: 'Type a Minecraft Java username to copy their skin into your library.' }),
      h('label', { class: 'field' }, h('span', { text: 'Username' }), input),
      err,
    );
    await modal({
      title: 'Get Player Skin', body,
      actions: [{ label: 'Cancel' }, {
        label: 'Get Skin', kind: 'green', icon: 'player', primary: true,
        handler: async () => {
          const name = input.value.trim();
          err.textContent = '';
          if (!name) { err.textContent = 'Enter a username first'; sfx.error(); return false; }
          body.classList.add('loading');
          try {
            const r = await api.fetchPlayer(name);
            const c = normalizeSkin(await loadImage(b64ToSrc(r.png)));
            const meta = await api.save({ name: r.name, model: r.model, png: canvasToB64(c) });
            sfx.levelup();
            toast('Skin acquired!', `Got ${r.name}'s skin`, 'player');
            await this.refresh(meta.id);
          } catch (e) {
            err.textContent = e.message;
            sfx.error();
            return false;
          } finally {
            body.classList.remove('loading');
          }
        },
      }],
      onOpen: () => input.focus(),
    });
  }

  async rename(s) {
    const input = h('input', { class: 'mc-input', maxlength: 40, value: s.name, spellcheck: 'false', dir: 'auto' });
    const res = await modal({
      title: 'Rename Skin',
      body: h('label', { class: 'field' }, h('span', { text: 'Name' }), input),
      actions: [{ label: 'Cancel' }, { label: 'Rename', kind: 'green', icon: 'pencil', primary: true, value: 'ok' }],
      onOpen: () => { input.focus(); input.select(); },
    });
    if (res !== 'ok' || !input.value.trim() || input.value.trim() === s.name) return;
    try {
      await api.rename(s.id, input.value.trim());
      await this.refresh(s.id);
    } catch (e) { toast('Rename failed', e.message, 'trash', 'bad'); }
  }

  async duplicate(s) {
    try {
      const c = await api.duplicate(s.id);
      sfx.chime();
      toast('Duplicated!', c.name, 'copy');
      await this.refresh(c.id);
    } catch (e) { toast('Duplicate failed', e.message, 'trash', 'bad'); }
  }

  async exportSkin(s) {
    try {
      if (await api.exportFile(s.name, s.png)) { sfx.levelup(); toast('Skin exported!', 'Ready to upload to Minecraft', 'download'); }
    } catch (e) { toast('Export failed', e.message, 'trash', 'bad'); }
  }

  async remove(s, card) {
    const res = await modal({
      title: 'Delete Skin?',
      body: h('p', {}, 'Delete "', h('b', { text: s.name }), '"? It goes to the Recycle Bin, so you can still get it back.'),
      actions: [{ label: 'Cancel' }, { label: 'Delete', kind: 'red', icon: 'trash', primary: true, value: 'ok' }],
    });
    if (res !== 'ok') return;
    const e = this.cache.get(s.id);
    const data = e.canvas.getContext('2d').getImageData(0, 0, 64, 64).data;
    const colors = [];
    for (let i = 0; i < 400 && colors.length < 24; i++) {
      const t = ((Math.random() * 4096) | 0) * 4;
      if (data[t + 3] > 200) colors.push(`rgb(${data[t]},${data[t + 1]},${data[t + 2]})`);
    }
    if (!colors.length) colors.push('#888');
    try {
      await api.remove(s.id);
    } catch (err) {
      toast('Delete failed', err.message, 'trash', 'bad');
      return;
    }
    sfx.crack();
    pixelBurst(card.getBoundingClientRect(), colors, 54);
    card.classList.add('breaking');
    this.cache.delete(s.id);
    e.tex.dispose();
    setTimeout(() => { this.skins = this.skins.filter((x) => x.id !== s.id); this.render(); }, 260);
  }
}
