import '../styles/assignments.css';
import { initApp } from '../lib/shell.js';
import { api } from '../lib/api.js';
import { $, $$, busy, clear, formData, h, showFieldErrors } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { dueBucket, dueLabel, formatDay, fromLocalInput, plural, toLocalInput } from '../lib/format.js';
import { celebrateReward } from '../lib/companion.js';
import { createSheet } from '../lib/sheet.js';
import { toast, toastError } from '../lib/toast.js';

const shell = await initApp('assignments');
const sheet = createSheet($('#sheet'));
const form = $('#form');

let assignments = [];
let editing = null;

const GROUPS = [
  ['late', 'Late'],
  ['today', 'Due today'],
  ['week', 'This week'],
  ['later', 'Later'],
  ['done', 'Done'],
];

const cap = (s) => s[0].toUpperCase() + s.slice(1);

function row(a) {
  const done = a.status === 'completed';
  const bucket = dueBucket(a);
  const check = h('input', { type: 'checkbox', checked: done, 'aria-label': done ? `Reopen “${a.title}”` : `Mark “${a.title}” done` });
  const pct = Math.min(1, a.hoursWorked / a.totalHours);
  const bar = h('i');
  bar.style.setProperty('--p', pct.toFixed(3));

  const logHour = h(
    'button.btn.btn-quiet.btn-icon',
    { type: 'button', title: 'Log an hour of work', 'aria-label': `Log an hour on “${a.title}”`, hidden: done },
    icon('clock'),
  );
  const edit = h('button.btn.btn-quiet.btn-icon', { type: 'button', title: 'Edit', 'aria-label': `Edit “${a.title}”` }, icon('pencil'));

  const el = h(
    `li.task${done ? '.is-done' : ''}`,
    h('label.pebble', check, h('i')),
    h(
      'div.task-main',
      h('b', a.title),
      h(
        'div.sub',
        h('span', a.course),
        h(`span.tag.tag-${done ? 'done' : bucket === 'late' ? 'overdue' : a.priority}`, done ? 'Done' : bucket === 'late' ? 'Late' : cap(a.priority)),
        a.officialId ? h('span.tag', icon('book'), 'Course') : null,
      ),
    ),
    h(
      'div.hours',
      h('div.hours-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': a.totalHours, 'aria-valuenow': a.hoursWorked, 'aria-label': 'Hours worked' }, bar),
      h('div.hours-label', h('span', `${a.hoursWorked} of ${plural(a.totalHours, 'hour')}`)),
    ),
    h(`span.due.due-col${bucket === 'late' ? '.late' : ''}`, done ? `Done ${formatDay(a.completedAt ?? a.dueAt)}` : dueLabel(a.dueAt)),
    h('div.task-actions', logHour, edit),
  );

  check.addEventListener('change', async () => {
    check.disabled = true;
    try {
      if (check.checked) {
        const result = await api.post(`/assignments/${a.id}/complete`);
        celebrateReward(result, { shell, what: `“${a.title}” done` });
        if (!result.reward) toast('Marked done again. Rewards only count once.');
      } else {
        await api.patch(`/assignments/${a.id}`, { status: 'in_progress' });
        toast('Reopened');
      }
      await load();
    } catch (err) {
      check.checked = !check.checked;
      check.disabled = false;
      toastError(err);
    }
  });
  logHour.addEventListener('click', async () => {
    busy(logHour);
    try {
      const result = await api.post(`/assignments/${a.id}/log-hours`, { hours: 1 });
      if (result.reward) celebrateReward(result, { shell, what: `“${a.title}” done` });
      else toast({ title: 'An hour logged', body: `${result.assignment.hoursWorked} of ${plural(result.assignment.totalHours, 'hour')} on ${a.title}`, icon: 'clock' });
      await load();
    } catch (err) {
      busy(logHour, false);
      toastError(err);
    }
  });
  edit.addEventListener('click', () => openSheet(a));
  return el;
}

function render() {
  const view = $('input[name="view"]:checked').value;
  const q = $('#search').value.trim().toLowerCase();
  const groups = $('#groups');
  clear(groups);

  const visible = assignments.filter((a) => {
    if (view === 'open' && a.status === 'completed') return false;
    if (view === 'completed' && a.status !== 'completed') return false;
    return !q || a.title.toLowerCase().includes(q) || a.course.toLowerCase().includes(q);
  });

  const open = assignments.filter((a) => a.status !== 'completed');
  const late = open.filter((a) => dueBucket(a) === 'late').length;
  $('#summary').textContent = open.length
    ? `${plural(open.length, 'open assignment')}${late ? ` · ${late} late` : ''}`
    : 'All caught up.';

  if (!visible.length) {
    groups.append(
      h(
        'div.empty',
        h('h3', q ? 'No matches' : view === 'completed' ? 'Nothing finished yet' : 'Nothing on your list'),
        h('p', q ? 'Try a different word, or clear the search.' : 'Add what’s due and your companion will cheer you through it.'),
        q ? null : h('button.btn.btn-primary', { type: 'button', onclick: () => openSheet() }, icon('plus'), 'Add assignment'),
      ),
    );
    return;
  }

  for (const [key, label] of GROUPS) {
    const items = visible.filter((a) => dueBucket(a) === key);
    if (!items.length) continue;
    groups.append(
      h(
        `section.group.${key}`,
        { 'aria-label': label },
        h('h2', label, h('span.count', String(items.length))),
        h('ul.task-list', items.map(row)),
      ),
    );
  }
}

async function load() {
  try {
    ({ assignments } = await api.get('/assignments'));
    render();
  } catch (err) {
    toastError(err);
  }
}

async function loadOfficial() {
  try {
    const { official } = await api.get('/official');
    const pending = official.filter((o) => !o.added);
    $('#official').hidden = pending.length === 0;
    const list = clear($('#official-list'));
    for (const o of pending) {
      const add = h('button.btn', { type: 'button' }, icon('plus'), 'Add to my list');
      add.addEventListener('click', async () => {
        busy(add);
        try {
          await api.post(`/official/${o.id}/add`);
          toast({ title: 'Added', body: `${o.course}: ${o.title}`, icon: 'book' });
          await Promise.all([load(), loadOfficial()]);
        } catch (err) {
          busy(add, false);
          toastError(err);
        }
      });
      list.append(
        h(
          'li',
          h('div', h('b', `${o.course}: ${o.title}`), h('span', `${dueLabel(o.dueAt)} · about ${plural(o.estimatedHours, 'hour')}`)),
          h(`span.tag.tag-${o.priority}`, cap(o.priority)),
          add,
        ),
      );
    }
  } catch {
    $('#official').hidden = true;
  }
}

// ── create / edit sheet ─────────────────────────────────────────
function openSheet(a = null) {
  editing = a;
  form.reset();
  showFieldErrors(form, {});
  form.querySelector('.form-error').hidden = true;
  $('#sheet-title').textContent = a ? 'Edit assignment' : 'New assignment';
  $('#delete').hidden = !a;
  if (a) {
    form.course.value = a.course;
    form.title.value = a.title;
    form.totalHours.value = a.totalHours;
    form.dueAt.value = toLocalInput(a.dueAt);
    form.description.value = a.description;
    $(`input[name="priority"][value="${a.priority}"]`).checked = true;
  } else {
    const preset = new URLSearchParams(location.search).get('due');
    const due = preset ? new Date(`${preset}T23:59:00`) : new Date(Date.now() + 3 * 86_400_000);
    if (Number.isNaN(due.getTime())) due.setTime(Date.now() + 3 * 86_400_000);
    due.setHours(23, 59, 0, 0);
    form.dueAt.value = toLocalInput(due.toISOString());
  }
  sheet.open();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = formData(form);
  const payload = {
    course: data.course,
    title: data.title,
    dueAt: fromLocalInput(data.dueAt),
    priority: data.priority,
    totalHours: data.totalHours,
    description: data.description,
  };
  const save = $('#save');
  busy(save);
  try {
    if (editing) await api.patch(`/assignments/${editing.id}`, payload);
    else await api.post('/assignments', payload);
    sheet.close();
    toast(editing ? 'Saved' : { title: 'Added', body: `${payload.course}: ${payload.title}`, icon: 'plus' });
    await load();
  } catch (err) {
    if (err.fields?.length) showFieldErrors(form, err.fieldErrors);
    else {
      const box = form.querySelector('.form-error');
      box.textContent = err.message;
      box.hidden = false;
    }
  } finally {
    busy(save, false);
  }
});

$('#delete').addEventListener('click', async () => {
  if (!editing) return;
  const btn = $('#delete');
  if (btn.dataset.confirm !== 'yes') {
    btn.dataset.confirm = 'yes';
    btn.lastChild.textContent = 'Delete for good?';
    setTimeout(() => {
      btn.dataset.confirm = '';
      btn.lastChild.textContent = 'Delete';
    }, 3500);
    return;
  }
  busy(btn);
  try {
    await api.del(`/assignments/${editing.id}`);
    sheet.close();
    toast('Deleted');
    await load();
  } catch (err) {
    toastError(err);
  } finally {
    busy(btn, false);
    btn.dataset.confirm = '';
    btn.lastChild.textContent = 'Delete';
  }
});

$('#add').addEventListener('click', () => openSheet());
for (const r of $$('input[name="view"]')) r.addEventListener('change', render);
$('#search').addEventListener('input', render);

await Promise.all([load(), loadOfficial()]);
if (new URLSearchParams(location.search).has('new')) openSheet();
