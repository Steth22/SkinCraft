import { icon } from './icons.js';
export { icon };

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export function keyOf(e) {
  if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase();
  if (e.code.startsWith('Digit')) return e.code.slice(5);
  return e.key.toLowerCase();
}

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

// ---------- Sound (synthesized, no files) ----------
let actx = null, master = null;
let soundOn = true;
try { soundOn = localStorage.getItem('sc-sound') !== 'off'; } catch {}

function audio() {
  if (!actx) {
    actx = new AudioContext();
    master = actx.createGain();
    master.gain.value = 0.9;
    master.connect(actx.destination);
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function tone({ freq = 440, type = 'square', dur = 0.08, vol = 0.06, slide = 0, delay = 0 }) {
  if (!soundOn) return;
  const a = audio(), t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise({ dur = 0.2, vol = 0.1, freq = 1200, to = 0, q = 0.8, delay = 0 }) {
  if (!soundOn) return;
  const a = audio(), t = a.currentTime + delay;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  click: () => { tone({ freq: 620, dur: 0.05, vol: 0.035, slide: 0.55 }); noise({ dur: 0.04, vol: 0.05, freq: 3000 }); },
  pop: () => tone({ freq: 260 + Math.random() * 180, type: 'sine', dur: 0.07, vol: 0.05, slide: 1.9 }),
  erase: () => noise({ dur: 0.06, vol: 0.06, freq: 2400 + Math.random() * 800 }),
  pick: () => { tone({ freq: 880, type: 'sine', dur: 0.06, vol: 0.05, slide: 1.5 }); tone({ freq: 1320, type: 'sine', dur: 0.08, vol: 0.04, delay: 0.05 }); },
  whoosh: () => noise({ dur: 0.5, vol: 0.09, freq: 300, to: 2600, q: 0.6 }),
  crack: () => { noise({ dur: 0.28, vol: 0.2, freq: 700, to: 180, q: 0.5 }); tone({ freq: 140, dur: 0.14, vol: 0.05, slide: 0.4 }); },
  land: () => { noise({ dur: 0.22, vol: 0.18, freq: 380, to: 90, q: 0.7 }); tone({ freq: 90, type: 'sine', dur: 0.18, vol: 0.12, slide: 0.6 }); },
  chime: () => { tone({ freq: 659, type: 'triangle', dur: 0.2, vol: 0.06 }); tone({ freq: 988, type: 'triangle', dur: 0.35, vol: 0.06, delay: 0.09 }); },
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.05, delay: i * 0.07 })),
  error: () => { tone({ freq: 220, dur: 0.12, vol: 0.05 }); tone({ freq: 165, dur: 0.18, vol: 0.05, delay: 0.1 }); },
  fill: () => noise({ dur: 0.3, vol: 0.08, freq: 600, to: 2400, q: 1.2 }),
};

export const sound = {
  get on() { return soundOn; },
  toggle() {
    soundOn = !soundOn;
    try { localStorage.setItem('sc-sound', soundOn ? 'on' : 'off'); } catch {}
    if (soundOn) sfx.click();
    return soundOn;
  },
};

document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.mc-btn, .model-opt, .swatch, .mb-part')) sfx.click();
}, true);

// ---------- Tooltip (Minecraft item-tooltip style) ----------
const tip = h('div', { id: 'tip' });
document.body.append(tip);
let tipFor = null;
document.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  const el = e.target.closest('[data-tip]');
  if (el === tipFor) return;
  tipFor = el;
  if (!el) return tip.classList.remove('on');
  const [title, sub] = el.dataset.tip.split('|');
  tip.innerHTML = '';
  tip.append(h('div', { text: title }));
  if (sub) tip.append(h('div', { class: 'k', text: sub }));
  placeTip(e);
  tip.classList.add('on');
});
document.addEventListener('pointermove', (e) => { if (tipFor) placeTip(e); });
function placeTip(e) {
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 16, y = e.clientY - r.height - 10;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 16;
  if (y < 8) y = e.clientY + 22;
  tip.style.transform = `translate(${x}px, ${y}px)`;
}
document.addEventListener('pointerdown', () => { tipFor = null; tip.classList.remove('on'); });

window.addEventListener('focus', () => {
  const input = $('.modal-back:last-child .modal input');
  if (input && document.activeElement !== input) input.focus();
});

// ---------- Toasts (advancement style) ----------
export function toast(title, text, ico = 'star', kind = '') {
  const el = h('div', { class: 'toast ' + kind },
    h('div', { class: 'ti', html: icon(ico, 2) }),
    h('div', {}, h('div', { class: 't1', text: title }), h('div', { class: 't2', text })),
  );
  $('#toasts').append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  setTimeout(() => {
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  }, 2800);
}

// ---------- Modal ----------
export function modal({ title, body, actions = [], onOpen, wide = false }) {
  return new Promise((resolve) => {
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal panel' + (wide ? ' wide' : '') });
    const content = h('div', { class: 'modal-body' });
    if (typeof body === 'string') content.innerHTML = body;
    else if (body) content.append(body);
    const row = h('div', { class: 'actions' });
    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      box.classList.add('out');
      back.classList.add('out');
      setTimeout(() => back.remove(), 200);
      resolve(value);
    };
    const run = async (a) => {
      if (a.busy) return;
      if (a.handler) {
        a.busy = true;
        btns.forEach((b) => (b.disabled = true));
        let keep;
        try { keep = (await a.handler(content)) === false; } finally {
          a.busy = false;
          btns.forEach((b) => (b.disabled = false));
        }
        if (keep) return;
      }
      close(a.value);
    };
    const btns = actions.map((a) => {
      const b = h('button', { class: 'mc-btn ' + (a.kind || ''), html: (a.icon ? icon(a.icon, 2) : '') + `<span>${a.label}</span>` });
      b.onclick = () => run(a);
      row.append(b);
      return b;
    });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter') {
        const primary = actions.find((a) => a.primary);
        if (primary) { e.preventDefault(); e.stopPropagation(); run(primary); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(null); });
    box.addEventListener('pointerup', (e) => { if (!e.target.closest('input, button')) $('input', content)?.focus(); });
    box.append(h('h2', { text: title }), content, row);
    back.append(box);
    $('#modal-root').append(back);
    onOpen?.(content, close);
  });
}

// ---------- Pixel wipe transition ----------
export async function wipe(mid) {
  const cv = $('#wipe');
  const dpr = Math.min(devicePixelRatio, 2);
  cv.width = innerWidth * dpr;
  cv.height = innerHeight * dpr;
  cv.classList.add('on');
  const ctx = cv.getContext('2d');
  const S = 56 * dpr;
  const cols = Math.ceil(cv.width / S), rows = Math.ceil(cv.height / S);
  const cells = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      cells.push({ x, y, d: (x / cols) * 0.6 + (y / rows) * 0.25 + Math.random() * 0.15, c: 12 + ((Math.random() * 10) | 0) });
  const draw = (p, reverse) => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const c of cells) {
      let k = Math.min(1, Math.max(0, (p - c.d * 0.55) / 0.45));
      if (reverse) k = 1 - Math.min(1, Math.max(0, (p - c.d * 0.55) / 0.45));
      if (k <= 0) continue;
      const s = S * (k < 1 ? k * 1.02 : 1.02);
      const cx = c.x * S + S / 2, cy = c.y * S + S / 2;
      ctx.fillStyle = `rgb(${c.c},${c.c - 2},${c.c + 12})`;
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    }
  };
  const run = (dur, reverse) => new Promise((res) => {
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      draw(p, reverse);
      if (p < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  sfx.whoosh();
  await run(380, false);
  try { await mid(); } finally {
    await new Promise((r) => requestAnimationFrame(r));
    await run(420, true);
    cv.classList.remove('on');
  }
}

// ---------- DOM pixel burst (e.g. when a card is destroyed) ----------
export function pixelBurst(rect, colors, count = 40) {
  for (let i = 0; i < count; i++) {
    const s = 6 + Math.random() * 10;
    const el = h('div', { class: 'shard' });
    el.style.cssText = `left:${rect.left + Math.random() * rect.width}px;top:${rect.top + Math.random() * rect.height}px;width:${s}px;height:${s}px;background:${colors[(Math.random() * colors.length) | 0]}`;
    document.body.append(el);
    const dx = (Math.random() * 2 - 1) * 220, up = -80 - Math.random() * 160, fall = 260 + Math.random() * 260;
    const rot = (Math.random() * 2 - 1) * 540;
    el.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${up}px) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${fall}px) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: 800 + Math.random() * 500, easing: 'cubic-bezier(.25,.6,.5,1)' }).onfinish = () => el.remove();
  }
}

export function timeAgo(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${(s / 60) | 0}m ago`;
  if (s < 86400) return `${(s / 3600) | 0}h ago`;
  if (s < 86400 * 30) return `${(s / 86400) | 0}d ago`;
  return new Date(ms).toLocaleDateString();
}
