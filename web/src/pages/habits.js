import '../styles/habits.css';
import { initApp } from '../lib/shell.js';
import { api } from '../lib/api.js';
import { $, busy, clear, formData, h, showFieldErrors } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { formatDay, isoDay } from '../lib/format.js';
import { celebrateReward } from '../lib/companion.js';
import { toast, toastError } from '../lib/toast.js';

const shell = await initApp('habits');
const DAYS = 28;
const CHECKABLE = 3; // today and the two days before

const days = Array.from({ length: DAYS }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (DAYS - 1 - i));
  return d;
});

// Weekday initials above the grid.
const legend = $('#legend');
for (const [i, d] of days.entries()) {
  legend.append(h(`span${d.getDay() === 1 && i ? '.week-start' : ''}`, d.toLocaleDateString(undefined, { weekday: 'narrow' })));
}

function thisWeekCount(checkins) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  return checkins.filter((c) => new Date(`${c}T00:00:00`) >= start).length;
}

function habitRow(habit) {
  const set = new Set(habit.checkins);
  const grid = h('div.days', { role: 'group', 'aria-label': `${habit.name}: last four weeks` });
  days.forEach((d, i) => {
    const day = isoDay(d);
    const on = set.has(day);
    const recent = i >= DAYS - CHECKABLE;
    const cls = `.day${on ? '.on' : ''}${i === DAYS - 1 ? '.today' : ''}${d.getDay() === 1 && i ? '.week-start' : ''}${i < DAYS - 14 ? '.older' : ''}`;
    const label = `${formatDay(d)}: ${on ? 'done' : 'not done'}`;
    if (!recent) {
      grid.append(h(`span${cls}`, { title: label, role: 'img', 'aria-label': label }));
      return;
    }
    const btn = h(`button${cls}`, { type: 'button', 'aria-pressed': String(on), 'aria-label': `${label}. Toggle` });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        if (set.has(day)) {
          await api.del(`/habits/${habit.id}/checkins/${day}`);
        } else {
          const result = await api.put(`/habits/${habit.id}/checkins/${day}`);
          if (result.reward) celebrateReward(result, { shell, what: habit.name });
        }
        await load();
      } catch (err) {
        btn.disabled = false;
        toastError(err);
      }
    });
    grid.append(btn);
  });

  const count = thisWeekCount(habit.checkins);
  const remove = h('button.btn.btn-quiet.btn-icon', { type: 'button', title: 'Archive habit', 'aria-label': `Archive “${habit.name}”` }, icon('trash'));
  remove.addEventListener('click', async () => {
    if (remove.dataset.confirm !== 'yes') {
      remove.dataset.confirm = 'yes';
      remove.title = 'Click again to archive';
      remove.classList.add('btn-danger');
      setTimeout(() => {
        remove.dataset.confirm = '';
        remove.classList.remove('btn-danger');
      }, 3000);
      return;
    }
    busy(remove);
    try {
      await api.del(`/habits/${habit.id}`);
      toast(`Archived “${habit.name}”`);
      await load();
    } catch (err) {
      busy(remove, false);
      toastError(err);
    }
  });

  // On narrow screens the page-wide legend is hidden, so each card labels its own two weeks.
  const legendSmall = h(
    'div.days-legend',
    { 'aria-hidden': 'true' },
    days.slice(-14).map((d, i) => h(`span${i === 13 ? '.today' : ''}`, d.toLocaleDateString(undefined, { weekday: 'narrow' }))),
  );

  return h(
    'li.habit',
    h('div.habit-name', h('b', habit.name), h('span', habit.targetPerWeek === 7 ? 'Every day' : `${habit.targetPerWeek} days a week`)),
    legendSmall,
    grid,
    h(
      'div.habit-side',
      h('span.week-count', `${count} / ${habit.targetPerWeek} `, h('small', 'this week')),
      remove,
    ),
  );
}

async function load() {
  try {
    const { habits } = await api.get('/habits');
    const list = clear($('#habits'));
    $('#legend').hidden = habits.length === 0;
    if (!habits.length) {
      list.append(
        h('li.empty', h('h3', 'No habits growing yet'), h('p', 'Plant one above. Start small: something you could do on a tired day.')),
      );
      return;
    }
    for (const habit of habits) list.append(habitRow(habit));
  } catch (err) {
    toastError(err);
  }
}

$('#plant').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  showFieldErrors(form, {});
  busy(button);
  try {
    await api.post('/habits', formData(form));
    toast({ title: 'Planted', body: form.name.value, icon: 'sprout' });
    form.reset();
    await load();
  } catch (err) {
    if (err.fields?.length) showFieldErrors(form, err.fieldErrors);
    else toastError(err);
  } finally {
    busy(button, false);
  }
});

await load();
