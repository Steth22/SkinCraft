export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export class ColorPicker {
  constructor(root, onChange) {
    this.onChange = onChange;
    this.h = 0; this.s = 0; this.v = 0.6;
    root.innerHTML = `
      <div class="cp-sv"><canvas width="256" height="160"></canvas><div class="cp-knob"></div></div>
      <div class="cp-hue"><canvas width="256" height="12"></canvas><div class="cp-hknob"></div></div>
      <div class="cp-row">
        <div class="cp-swatch" data-tip="Current color|Previous color on the right"><span class="cp-cur"></span><span class="cp-prev"></span></div>
        <input class="mc-input cp-hex" maxlength="7" spellcheck="false">
      </div>`;
    this.sv = root.querySelector('.cp-sv canvas');
    this.hue = root.querySelector('.cp-hue canvas');
    this.knob = root.querySelector('.cp-knob');
    this.hknob = root.querySelector('.cp-hknob');
    this.cur = root.querySelector('.cp-cur');
    this.prev = root.querySelector('.cp-prev');
    this.hexIn = root.querySelector('.cp-hex');
    this.drawHue();
    this.drag(this.sv, (x, y) => { this.s = x; this.v = 1 - y; this.emit(); });
    this.drag(this.hue, (x) => { this.h = x * 359.9; this.drawSV(); this.emit(); });
    this.hexIn.addEventListener('input', () => {
      let v = this.hexIn.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) { this.set(v.toLowerCase(), true); this.onChange(this.hex, true); }
    });
    this.prev.addEventListener('click', () => {
      if (!this.prev.dataset.c) return;
      this.set(this.prev.dataset.c, false); this.onChange(this.hex, true); });
  }

  drag(canvas, fn) {
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      fn(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.dragging = true;
      at(e);
    });
    canvas.addEventListener('pointermove', (e) => { if (this.dragging) at(e); });
    const end = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.onChange(this.hex, true);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  drawHue() {
    const ctx = this.hue.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 12);
  }

  drawSV() {
    const ctx = this.sv.getContext('2d');
    const { width: w, height: hgt } = this.sv;
    ctx.fillStyle = `hsl(${this.h},100%,50%)`;
    ctx.fillRect(0, 0, w, hgt);
    const wg = ctx.createLinearGradient(0, 0, w, 0);
    wg.addColorStop(0, '#fff'); wg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, w, hgt);
    const bg = ctx.createLinearGradient(0, 0, 0, hgt);
    bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(1, '#000');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, hgt);
  }

  get hex() { return rgbToHex(...hsvToRgb(this.h, this.s, this.v)); }

  emit() {
    this.sync();
    this.onChange(this.hex, false);
  }

  sync() {
    const hex = this.hex;
    this.knob.style.left = this.s * 100 + '%';
    this.knob.style.top = (1 - this.v) * 100 + '%';
    this.knob.style.background = hex;
    this.hknob.style.left = (this.h / 360) * 100 + '%';
    this.cur.style.background = hex;
    if (document.activeElement !== this.hexIn) this.hexIn.value = hex.toUpperCase();
  }

  set(hex, fromInput = false) {
    if (!fromInput && this.cur.style.background) {
      const old = this.hex;
      if (old !== hex) { this.prev.style.background = old; this.prev.dataset.c = old; }
    }
    const [h, s, v] = rgbToHsv(...hexToRgb(hex));
    if (s > 0 && v > 0) this.h = h;
    this.s = s; this.v = v;
    this.drawSV();
    this.sync();
  }
}
