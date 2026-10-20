import '../styles/today.css';
import { initApp } from '../lib/shell.js';
import { gardenNight } from '../lib/theme.js';
import { api } from '../lib/api.js';
import { $, clear, h } from '../lib/dom.js';
import { dueBucket, dueLabel, greeting, isoDay, plural } from '../lib/format.js';
import { activityCaption, celebrateReward, companionName, STAGE_LABEL } from '../lib/companion.js';
import { toastError } from '../lib/toast.js';
import { mountGarden } from '../garden/index.js';

const shell = await initApp('today');
const { user } = shell;

$('#greeting').textContent = `${greeting()}, ${user.name.split(' ')[0]}.`;
const paintCompanionLine = (p) => {
  const next = p.nextStage ? `${p.nextStageXp - p.xp} growth until ${p.nextStage}` : 'fully grown';
  $('#companion-line').textContent = `${companionName(p)} is a ${STAGE_LABEL[p.stage]} ${p.companion} · ${next}`;
};
paintCompanionLine(user.progress);

const caption = $('#caption');
let lastCaption = '';
const garden = mountGarden($('#garden'), {
  companion: user.progress.companion,
  stage: user.progress.stage,
  night: gardenNight(),
  onEvent: (e) => {
    if (e.type !== 'state') return;
    const text = activityCaption(e.name, shell.user.progress);
    if (text !== lastCaption) caption.textContent = lastCaption = text;
  },
});
window.addEventListener('ustudy:theme', () => garden.setNight(gardenNight()));

const progressChanged = (result, what) => {
  celebrateReward(result, { shell, garden, what });
  if (result.progress) paintCompanionLine(result.progress);
};

// ── Next up ─────────────────────────────────────────────────────
function priorityTag(priority) {
  return h(`span.tag.tag-${priority}`, priority[0].toUpperCase() + priority.slice(1));
}

function assignmentRow(a, isNext) {
  const bucket = dueBucket(a);
  const checkbox = h('input', {
    type: 'checkbox',
    checked: a.status === 'completed',
    'aria-label': `Mark “${a.title}” done`,
  });
  const row = h(
    `li.stone-row${isNext ? '.is-next' : ''}${a.status === 'completed' ? '.is-done' : ''}`,
    h('label.pebble', checkbox, h('i')),
    h('div.stone-title', h('b', a.title), h('span', a.course)),
    h(
      'div.stone-meta',
      h(`span.due${bucket === 'late' ? '.late' : ''}`, dueLabel(a.dueAt)),
      priorityTag(a.priority),
    ),
  );
  checkbox.addEventListener('change', async () => {
    if (!checkbox.checked) {
      checkbox.checked = true; // reopening happens on the Assignments page
      return;
    }
    checkbox.disabled = true;
    row.classList.add('is-done');
    try {
      const result = await api.post(`/assignments/${a.id}/complete`);
      progressChanged(result, `“${a.title}” done`);
      setTimeout(loadAssignments, 900);
    } catch (err) {
      checkbox.checked = false;
      checkbox.disabled = false;
      row.classList.remove('is-done');
      toastError(err);
    }
  });
  return row;
}

async function loadAssignments() {
  const list = $('#next');
  try {
    const { assignments } = await api.get('/assignments');
    const open = assignments.filter((a) => a.status !== 'completed');
    const weekAhead = Date.now() + 7 * 86_400_000;
    $('#stat-week').textContent = String(open.filter((a) => new Date(a.dueAt) <= weekAhead).length);
    clear(list);
    if (!open.length) {
      list.append(
        h(
          'li.empty',
          h('h3', 'Nothing due. The gravel is freshly raked.'),
          h('p', 'Add what’s coming up and it will show here, nearest first.'),
          h('a.btn', { href: '/assignments.html?new=1' }, 'Add an assignment'),
        ),
      );
      return;
    }
    open.slice(0, 5).forEach((a, i) => list.append(assignmentRow(a, i === 0)));
    const next = open[0];
    $('#focus-suggest').textContent = `Suggested: ${next.title} (${next.course})`;
  } catch (err) {
    toastError(err);
  }
}

// ── Habits ──────────────────────────────────────────────────────
function streak(checkins) {
  const set = new Set(checkins);
  let n = 0;
  const d = new Date();
  if (!set.has(isoDay(d))) d.setDate(d.getDate() - 1); // today not done yet doesn't break a streak
  while (set.has(isoDay(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

async function loadHabits() {
  const list = $('#habits');
  try {
    const { habits } = await api.get('/habits');
    const today = isoDay();
    const done = habits.filter((x) => x.checkins.includes(today)).length;
    $('#stat-habits').textContent = habits.length ? `${done} / ${habits.length}` : '–';
    clear(list);
    if (!habits.length) {
      list.append(h('li.empty', h('p', 'No habits yet.'), h('a.btn', { href: '/habits.html' }, 'Plant a habit')));
      return;
    }
    for (const habit of habits) {
      const checked = habit.checkins.includes(today);
      const box = h('input', { type: 'checkbox', checked });
      const s = streak(habit.checkins);
      list.append(
        h(
          'li',
          h('label', h('span.pebble', box, h('i')), h('span', habit.name), h('span.streak', s ? `${plural(s, 'day')} running` : '')),
        ),
      );
      box.addEventListener('change', async () => {
        box.disabled = true;
        try {
          if (box.checked) {
            const result = await api.put(`/habits/${habit.id}/checkins/${today}`);
            if (result.reward) progressChanged(result, habit.name);
          } else {
            await api.del(`/habits/${habit.id}/checkins/${today}`);
          }
          await loadHabits();
        } catch (err) {
          box.checked = !box.checked;
          toastError(err);
        } finally {
          box.disabled = false;
        }
      });
    }
  } catch (err) {
    toastError(err);
  }
}

async function loadFocus() {
  try {
    const { days } = await api.get('/focus/stats');
    const today = days.find((d) => d.day === isoDay());
    const m = today?.minutes ?? 0;
    $('#stat-focus').textContent = m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} min`;
  } catch {
    $('#stat-focus').textContent = '–';
  }
}

await Promise.all([loadAssignments(), loadHabits(), loadFocus()]);
window.addEventListener('pagehide', () => garden.destroy());
