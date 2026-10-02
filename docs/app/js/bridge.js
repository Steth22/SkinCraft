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
  if (!wv) return web[method](params);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    wv.postMessage(JSON.stringify({ id, method, params }));
  });
}

// Web version: skins live in the browser's IndexedDB.
const DB_NAME = 'skincraft', STORE = 'skins';
let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error || new Error('Storage error'));
  });
}
const getSkin = async (id) => {
  const s = await idb('readonly', (st) => st.get(id));
  if (!s) throw new Error('Skin not found');
  return s;
};
const putSkin = (s) => idb('readwrite', (st) => st.put(s));
const newId = () => crypto.randomUUID().replace(/-/g, '');
const meta = ({ png, ...m }) => m;
const cleanName = (n) => (String(n || '').trim() || 'Untitled').slice(0, 40);

if (!wv) {
  navigator.storage?.persist?.();
  // Skins saved by earlier preview builds lived in localStorage.
  try {
    const old = JSON.parse(localStorage.getItem('sc-mock-skins') || '[]');
    if (old.length) Promise.all(old.map(putSkin)).then(() => localStorage.removeItem('sc-mock-skins'));
  } catch {}
}

const b64FromBlob = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(',')[1]);
  fr.onerror = () => reject(fr.error);
  fr.readAsDataURL(blob);
});

const web = {
  list: () => idb('readonly', (st) => st.getAll()),
  async save({ id, name, model, png }) {
    let s = id ? await idb('readonly', (st) => st.get(id)) : null;
    if (!s) s = { id: id || newId(), created: Date.now() };
    Object.assign(s, { name: cleanName(name), model: model === 'slim' ? 'slim' : 'classic', png, modified: Date.now() });
    await putSkin(s);
    return meta(s);
  },
  async rename({ id, name }) {
    const s = await getSkin(id);
    Object.assign(s, { name: cleanName(name), modified: Date.now() });
    await putSkin(s);
    return meta(s);
  },
  async delete({ id }) {
    await idb('readwrite', (st) => st.delete(id));
    return true;
  },
  async duplicate({ id }) {
    const s = await getSkin(id);
    const c = { ...s, id: newId(), name: cleanName(s.name + ' copy'), created: Date.now(), modified: Date.now() };
    await putSkin(c);
    return c;
  },
  importFile() {
    return new Promise((resolve) => {
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png', multiple: true });
      inp.onchange = async () => {
        const out = [];
        for (const f of inp.files) out.push({ name: f.name.replace(/\.png$/i, ''), png: await b64FromBlob(f) });
        resolve(out);
      };
      inp.oncancel = () => resolve([]);
      inp.click();
    });
  },
  async exportFile({ name, png }) {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const safe = String(name || 'skin').replace(/[\/:*?"<>|]/g, '').trim() || 'skin';
    Object.assign(document.createElement('a'), { href: url, download: safe + '.png' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  },
  async fetchPlayer({ name }) {
    name = String(name || '').trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) throw new Error('That is not a valid Minecraft username');
    let res;
    try { res = await fetch(`https://playerdb.co/api/player/minecraft/${name}`); } catch {
      throw new Error('Could not reach Minecraft servers. Check your internet connection.');
    }
    const data = await res.json().catch(() => null);
    const player = data?.data?.player;
    if (!res.ok || !player) throw new Error(`No player named "${name}"`);
    const prop = player.properties?.find((p) => p.name === 'textures');
    const tex = prop ? JSON.parse(atob(prop.value)).textures?.SKIN : null;
    if (!tex?.url) throw new Error('This player uses a default skin');
    const img = await fetch(tex.url.replace('http://', 'https://'));
    if (!img.ok) throw new Error('Could not download the skin');
    return { name: player.username, model: tex.metadata?.model === 'slim' ? 'slim' : 'classic', png: await b64FromBlob(await img.blob()) };
  },
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
