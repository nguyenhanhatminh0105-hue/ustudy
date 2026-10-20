import '@fontsource/zen-maru-gothic/latin-700.css';
import './popup.css';
import { mountGarden, portraitCanvas } from '../../web/src/garden/index.js';
import { MOTIFS } from './skins.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_SERVER = 'http://localhost:3000';
const storage = globalThis.chrome?.storage?.local;

async function getServer() {
  const saved = storage ? (await storage.get('server')).server : null;
  return saved || (location.protocol.startsWith('http') ? location.origin : DEFAULT_SERVER);
}

/** Read-only calls: the extension can look at your garden but never spends or changes anything. */
async function get(server, path) {
  const res = await fetch(`${server}/api${path}`, { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function applySkin(progress) {
  document.body.dataset.companion = progress.companion;
  document.body.dataset.stage = progress.stage;
  $('motif').innerHTML = MOTIFS[progress.companion][progress.stage]; // static authored SVG
}

/** The toolbar icon becomes a portrait of your companion at its current stage. */
function updateToolbarIcon(progress) {
  const action = globalThis.chrome?.action;
  if (!action) return;
  const imageData = {};
  for (const size of [16, 32]) {
    const canvas = portraitCanvas({ companion: progress.companion, stage: progress.stage, size: size * 2 });
    const small = document.createElement('canvas');
    small.width = small.height = size;
    small.getContext('2d').drawImage(canvas, 0, 0, size, size);
    imageData[size] = small.getContext('2d').getImageData(0, 0, size, size);
  }
  action.setIcon({ imageData });
  storage?.set({ companion: progress.companion, stage: progress.stage });
}

const rel = (iso) => {
  const h = Math.round((new Date(iso) - Date.now()) / 3_600_000);
  if (h < 0) return { text: 'late', late: true };
  if (h < 24) return { text: `${h} h` };
  return { text: `${Math.round(h / 24)} d` };
};

async function main() {
  const server = await getServer();
  $('server').value = server;
  for (const [id, page] of [['open-today', 'today'], ['open-focus', 'focus'], ['open-garden', 'garden']]) $(id).href = `${server}/${page}.html`;
  $('open-signin').href = `${server}/`;

  let session;
  try {
    session = await get(server, '/auth/session');
  } catch {
    $('offline').hidden = false;
    $('name').textContent = 'UStudy';
    $('stage').hidden = true;
    return;
  }
  const user = session?.user;
  if (!user) {
    $('signed-out').hidden = false;
    $('stage').hidden = true;
    mountGarden($('garden'), { companion: 'turtle', stage: 'baby' });
    return;
  }

  const p = { ...user.progress };
  // Preview other skins in a normal tab (never inside the installed extension): ?skin=panda-teen
  const preview = !globalThis.chrome?.runtime?.id && new URLSearchParams(location.search).get('skin');
  if (preview) [p.companion, p.stage] = preview.split('-');
  applySkin(p);
  $('name').textContent = p.companionName || (p.companion === 'panda' ? 'Bao' : 'Mochi');
  $('stage').textContent = p.stage;
  $('coins').textContent = p.coins;
  $('xp').textContent = p.xp;
  $('signed-in').hidden = false;
  mountGarden($('garden'), { companion: p.companion, stage: p.stage, pixelRatioCap: 2 });
  updateToolbarIcon(p);

  const bamboo = $('bamboo');
  for (let i = 1; i <= 4; i += 1) {
    const fill = i < p.stageIndex ? 1 : i === p.stageIndex && p.nextStageXp ? (p.xp - p.stageStartXp) / (p.nextStageXp - p.stageStartXp) : i === p.stageIndex ? 1 : 0;
    const span = document.createElement('span');
    const bar = document.createElement('i');
    bar.style.setProperty('--fill', Math.max(0, Math.min(1, fill)));
    span.append(bar);
    bamboo.append(span);
  }
  bamboo.setAttribute('aria-label', p.nextStage ? `${p.nextStageXp - p.xp} growth until ${p.nextStage}` : 'Fully grown');

  const data = await get(server, '/assignments?status=not_started').catch(() => null);
  const more = await get(server, '/assignments?status=in_progress').catch(() => null);
  const open = [...(data?.assignments ?? []), ...(more?.assignments ?? [])].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const soon = open.filter((a) => new Date(a.dueAt) - Date.now() < 48 * 3_600_000).length;
  $('due-count').textContent = soon;
  const list = $('next');
  if (!open.length) {
    const li = document.createElement('li');
    li.textContent = 'Nothing due. Enjoy the garden.';
    list.append(li);
  }
  for (const a of open.slice(0, 3)) {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = a.title; // text only
    const when = rel(a.dueAt);
    const span = document.createElement('span');
    span.textContent = when.text;
    if (when.late) span.className = 'late';
    li.append(b, span);
    list.append(li);
  }
  globalThis.chrome?.action?.setBadgeText({ text: soon ? String(soon) : '' });
}

$('server-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = $('server').value.trim().replace(/\/$/, '');
  if (!/^https?:\/\//.test(value)) return;
  await storage?.set({ server: value });
  location.reload();
});

main();
