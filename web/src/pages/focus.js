import '../styles/focus.css';
import { initApp } from '../lib/shell.js';
import { gardenNight } from '../lib/theme.js';
import { api } from '../lib/api.js';
import { $, busy, clear, h } from '../lib/dom.js';
import { isoDay, plural } from '../lib/format.js';
import { celebrateReward, companionName } from '../lib/companion.js';
import { toastError } from '../lib/toast.js';
import { mountGarden } from '../garden/index.js';

const shell = await initApp('focus');
const name = companionName(shell.user.progress);
const garden = mountGarden($('#garden'), {
  companion: shell.user.progress.companion,
  stage: shell.user.progress.stage,
  night: gardenNight(),
});
window.addEventListener('ustudy:theme', () => garden.setNight(gardenNight()));

const RINGS = 12;
const els = {
  time: $('#time'),
  sub: $('#timer-sub'),
  setup: $('#setup'),
  running: $('#running'),
  done: $('#done'),
  breath: $('#breath'),
};

// ── the raked rings ─────────────────────────────────────────────
const ns = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(ns, 'svg');
svg.setAttribute('viewBox', '0 0 200 200');
const rings = [];
for (let i = 0; i < RINGS; i += 1) {
  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx', '100');
  c.setAttribute('cy', '100');
  c.setAttribute('r', String(50 + i * 4.2));
  svg.append(c);
  rings.push(c);
}
$('#rake').append(svg);
function rake(progress) {
  const raked = Math.floor(progress * RINGS);
  rings.forEach((c, i) => {
    c.classList.toggle('raked', i < raked);
    c.classList.toggle('current', i === raked && progress > 0 && progress < 1);
  });
}

// ── a temple bell, synthesised (no audio files) ─────────────────
function ringBell() {
  if (!$('#bell').checked) return;
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    for (const [freq, gain, decay] of [[528, 0.32, 4.5], [1056, 0.12, 3], [1584, 0.06, 2.2], [264, 0.1, 5]]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + decay);
    }
    setTimeout(() => ctx.close(), 5500);
  } catch {
    /* audio unavailable; the visual finish is enough */
  }
}

// ── session state ───────────────────────────────────────────────
let session = null; // { id, plannedMinutes, startedAt, offset }
let tick = null;
let finishing = false;

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const selectedMinutes = () => Number(els.setup.minutes.value);

function show(view) {
  els.setup.hidden = view !== 'setup';
  els.running.hidden = view !== 'running';
  els.done.hidden = view !== 'done';
}

function idle() {
  els.time.textContent = fmt(selectedMinutes() * 60);
  els.sub.textContent = 'Ready when you are';
  rake(0);
}

function start(s) {
  session = {
    id: s.id,
    plannedMinutes: s.plannedMinutes,
    startedAt: new Date(s.startedAt).getTime(),
    // server clock minus ours, so the countdown matches what the server will credit
    offset: s.serverNow ? new Date(s.serverNow).getTime() - Date.now() : 0,
  };
  const title = s.assignmentTitle ?? els.setup.assignment.selectedOptions[0]?.dataset.title;
  els.sub.textContent = title ? `Working on ${title}` : `${name} is sitting quietly with you.`;
  show('running');
  garden.setMode('focus');
  document.title = 'Focusing… · UStudy';
  clearInterval(tick);
  tick = setInterval(update, 250);
  update();
}

let lastBreath = '';
function update() {
  if (!session) return;
  const total = session.plannedMinutes * 60;
  const elapsed = (Date.now() + session.offset - session.startedAt) / 1000;
  const left = Math.max(0, total - elapsed);
  els.time.textContent = fmt(left);
  document.title = `${fmt(left)} · Focus · UStudy`;
  rake(Math.min(1, elapsed / total));
  // 4-second in, 6-second out breathing guide
  const phase = elapsed % 10 < 4 ? 'Breathe in' : 'Breathe out';
  if (phase !== lastBreath) els.breath.textContent = lastBreath = phase;
  if (left <= 0 && !finishing) finish(true);
}

async function finish(completed) {
  if (!session || finishing) return;
  finishing = true;
  clearInterval(tick);
  try {
    const result = await api.post(`/focus/${session.id}/finish`);
    if (completed) ringBell();
    rake(completed ? 1 : Math.min(1, result.minutes / session.plannedMinutes));
    garden.setMode('free');
    const m = result.minutes;
    const text = $('#done-text');
    clear(text);
    if (m < 5) {
      text.append(`Short sit: ${plural(m, 'minute')}. Sessions count from five minutes.`);
    } else {
      text.append('You focused for ', h('b', plural(m, 'minute')), completed ? `. ${name} is proud of you.` : '. Every minute counts.');
      if (result.capped) text.append(h('br'), 'You’ve reached today’s focus growth limit; coins still count.');
      celebrateReward(result, { shell, garden, what: 'Focus session complete' });
    }
    els.time.textContent = fmt(0);
    els.sub.textContent = completed ? 'Time’s up.' : 'Session ended.';
    show('done');
    document.title = 'Focus · UStudy';
    loadWeek();
  } catch (err) {
    toastError(err);
    show('setup');
  } finally {
    session = null;
    finishing = false;
  }
}

els.setup.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = $('#start');
  busy(button);
  try {
    const assignmentId = els.setup.assignment.value ? Number(els.setup.assignment.value) : null;
    const { session: s } = await api.post('/focus', { plannedMinutes: selectedMinutes(), assignmentId });
    start(s);
  } catch (err) {
    toastError(err);
  } finally {
    busy(button, false);
  }
});
els.setup.addEventListener('change', (e) => {
  if (e.target.name === 'minutes') idle();
});
$('#end').addEventListener('click', () => finish(false));
$('#again').addEventListener('click', () => {
  show('setup');
  idle();
});

// ── data ────────────────────────────────────────────────────────
async function loadAssignments() {
  try {
    const { assignments } = await api.get('/assignments?status=in_progress');
    const { assignments: notStarted } = await api.get('/assignments?status=not_started');
    const select = els.setup.assignment;
    for (const a of [...assignments, ...notStarted].slice(0, 12)) {
      select.append(h('option', { value: String(a.id), dataset: { title: a.title } }, `${a.course}: ${a.title}`));
    }
    const pre = new URLSearchParams(location.search).get('assignment');
    if (pre) select.value = pre;
  } catch {
    /* the picker is optional */
  }
}

async function loadWeek() {
  try {
    const { days } = await api.get('/focus/stats');
    const byDay = new Map(days.map((d) => [d.day, d.minutes]));
    const series = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86_400_000);
      series.push({ day: isoDay(d), label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), minutes: byDay.get(isoDay(d)) ?? 0 });
    }
    const max = Math.max(60, ...series.map((s) => s.minutes));
    const total = series.reduce((sum, s) => sum + s.minutes, 0);
    $('#week-total').textContent = `${Math.floor(total / 60)} h ${total % 60} m in total`;
    const week = clear($('#week'));
    week.setAttribute('aria-label', `Focus minutes per day for the last 14 days, ${total} minutes in total`);
    for (const s of series) {
      const bar = h(`div.bar${s.day === isoDay() ? '.today' : ''}`, { title: `${s.day}: ${s.minutes} min` }, h('i'), h('span', s.label));
      bar.querySelector('i').style.setProperty('--h', (s.minutes / max).toFixed(3));
      week.append(bar);
    }
  } catch {
    /* chart is a nice-to-have */
  }
}

await loadAssignments();
loadWeek();
idle();
// Resume a session that was running before a reload.
try {
  const { session: active } = await api.get('/focus/active');
  if (active) start(active);
} catch {
  /* start fresh */
}
window.addEventListener('pagehide', () => garden.destroy());
