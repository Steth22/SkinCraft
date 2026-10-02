const wv = window.chrome && window.chrome.webview;
const pending = new Map();
let seq = 0;

if (wv) {
  wv.addEventListener('message', (e) => {
    const m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.result);
    else p.reject(new Error(m.error || 'Unknown error'));
  });
}

function call(method, params = {}) {
  if (!wv) return mock[method](params);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    wv.postMessage(JSON.stringify({ id, method, params }));
  });
}

// Browser-only stand-in so the UI can be previewed outside the desktop app.
const KEY = 'sc-mock-skins';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const store = (list) => localStorage.setItem(KEY, JSON.stringify(list));
const meta = ({ png, ...m }) => m;
const mock = {
  async list() { return load(); },
  async save({ id, name, model, png }) {
    const list = load();
    let s = list.find((x) => x.id === id);
    if (!s) { s = { id: crypto.randomUUID().replace(/-/g, ''), created: Date.now() }; list.push(s); }
    Object.assign(s, { name: name || 'Untitled', model, png, modified: Date.now() });
    store(list);
    return meta(s);
  },
  async rename({ id, name }) {
    const list = load(); const s = list.find((x) => x.id === id);
    s.name = name; s.modified = Date.now(); store(list); return meta(s);
  },
  async delete({ id }) { store(load().filter((x) => x.id !== id)); return true; },
  async duplicate({ id }) {
    const list = load(); const s = list.find((x) => x.id === id);
    const c = { ...s, id: crypto.randomUUID().replace(/-/g, ''), name: s.name + ' copy', created: Date.now(), modified: Date.now() };
    list.push(c); store(list); return c;
  },
  importFile() {
    return new Promise((resolve) => {
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.png', multiple: true });
      inp.onchange = async () => {
        const out = [];
        for (const f of inp.files) {
          const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
          out.push({ name: f.name.replace(/\.png$/i, ''), png: url.split(',')[1] });
        }
        resolve(out);
      };
      inp.click();
    });
  },
  async exportFile({ name, png }) {
    Object.assign(document.createElement('a'), { href: 'data:image/png;base64,' + png, download: name + '.png' }).click();
    return true;
  },
  async fetchPlayer() { throw new Error('Fetching player skins works in the desktop app only'); },
  async openFolder() { return true; },
};

export const api = {
  desktop: !!wv,
  list: () => call('list'),
  save: (p) => call('save', p),
  rename: (id, name) => call('rename', { id, name }),
  remove: (id) => call('delete', { id }),
  duplicate: (id) => call('duplicate', { id }),
  importFile: () => call('importFile'),
  exportFile: (name, png) => call('exportFile', { name, png }),
  fetchPlayer: (name) => call('fetchPlayer', { name }),
  openFolder: () => call('openFolder'),
};
