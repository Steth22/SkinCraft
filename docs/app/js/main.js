import { World } from './world.js';
import { Library } from './library.js';
import { Editor } from './editor.js';
import { $, $$, wipe, sound, icon, toast } from './ui.js';

const world = new World($('#world'));
const library = new Library(world);
const editor = new Editor(world);
let mode = 'library';

const syncSound = () => $$('.sound-btn').forEach((b) => (b.innerHTML = icon(sound.on ? 'sound' : 'mute', 2)));
$$('.sound-btn').forEach((b) => b.addEventListener('click', () => { sound.toggle(); syncSound(); }));
syncSound();

const liteBtn = $('#btn-lite');
liteBtn.innerHTML = icon('bolt', 2);
let lite = matchMedia('(pointer: coarse)').matches;
try {
  const saved = localStorage.getItem('sc-lite');
  if (saved) lite = saved === 'on';
} catch {}
const applyLite = () => {
  document.body.classList.toggle('lite', lite);
  liteBtn.classList.toggle('active', lite);
  world.setLite(lite);
};
applyLite();
liteBtn.addEventListener('click', () => {
  lite = !lite;
  try { localStorage.setItem('sc-lite', lite ? 'on' : 'off'); } catch {}
  applyLite();
  toast(lite ? 'Performance mode ON' : 'Performance mode OFF', lite ? 'Extra effects hidden for speed' : 'All effects are back', 'bolt');
});

library.onOpen = (skin) => wipe(async () => {
  library.el.classList.add('hidden');
  await editor.open(skin);
  mode = 'editor';
});

editor.onBack = () => wipe(async () => {
  await editor.close();
  world.setMode('library');
  mode = 'library';
  library.el.classList.remove('hidden');
  await library.refresh(editor.lastId);
});

window.__flush = () => editor.flush();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') editor.flush(); });
window.addEventListener('pagehide', () => editor.flush());

if (!window.chrome?.webview && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  world.update(dt);
  if (mode === 'editor') editor.update(dt);
  else library.update(dt);
  world.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const t0 = performance.now();
await document.fonts.ready;
await library.refresh();
await new Promise((r) => setTimeout(r, Math.max(0, 1100 - (performance.now() - t0))));
$('#loader').classList.add('done');
setTimeout(() => $('#loader').remove(), 800);
