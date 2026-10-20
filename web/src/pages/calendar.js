import '../styles/calendar.css';
import { initApp } from '../lib/shell.js';
import { api } from '../lib/api.js';
import { $, clear, h } from '../lib/dom.js';
import { formatLong, formatTime, isoDay, plural } from '../lib/format.js';
import { toastError } from '../lib/toast.js';

await initApp('calendar');

let assignments = [];
let cursor = new Date();
cursor.setDate(1);
let selected = isoDay();

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

// A course always gets the same colour.
const courseColors = new Map();
function colorFor(course) {
  if (!courseColors.has(course)) {
    let hash = 0;
    for (const ch of course) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    courseColors.set(course, hash % 6);
  }
  return courseColors.get(course);
}
function tint(el, course) {
  const c = colorFor(course);
  el.style.setProperty('--chip', `var(--c${c})`);
  el.style.setProperty('--chip-soft', `var(--c${c}s)`);
  return el;
}

const byDay = () => {
  const map = new Map();
  for (const a of assignments) {
    const key = isoDay(a.dueAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  }
  return map;
};

function render() {
  const map = byDay();
  const cal = clear($('#cal'));
  $('#month').textContent = monthFmt.format(cursor);

  // Sunday-first weeks, like most North American calendars.
  const first = new Date(cursor);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cal.append(h('div.cal-head', { role: 'columnheader' }, weekdayFmt.format(d)));
  }

  let monthCount = 0;
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== cursor.getMonth()) break;
    const key = isoDay(d);
    const items = map.get(key) ?? [];
    const inMonth = d.getMonth() === cursor.getMonth();
    if (inMonth) monthCount += items.length;
    const cell = h(
      `button.cal-day${inMonth ? '' : '.outside'}${key === isoDay() ? '.is-today' : ''}`,
      {
        type: 'button',
        role: 'gridcell',
        'aria-selected': String(key === selected),
        'aria-label': `${formatLong(d)}${items.length ? `, ${plural(items.length, 'item')} due` : ''}`,
      },
      h('span.date', String(d.getDate())),
      items.slice(0, 3).map((a) => tint(h(`span.chip${a.status === 'completed' ? '.done' : ''}`, a.title), a.course)),
      items.length > 3 ? h('span.more', `+${items.length - 3} more`) : null,
    );
    cell.addEventListener('click', () => {
      selected = key;
      render();
    });
    cal.append(cell);
  }
  $('#month-summary').textContent = monthCount ? `${plural(monthCount, 'thing')} due this month` : 'A quiet month so far.';
  renderDay(map);
}

function renderDay(map) {
  const date = new Date(`${selected}T12:00:00`);
  $('#day-title').textContent = formatLong(date);
  const list = clear($('#day-items'));
  const items = map.get(selected) ?? [];
  if (!items.length) list.append(h('li.none', 'Nothing due.'));
  for (const a of items) {
    list.append(tint(h('li', h('b', a.title), h('span', `${a.course} · ${formatTime(a.dueAt)}${a.status === 'completed' ? ' · done' : ''}`)), a.course));
  }
  $('#day-add').href = `/assignments.html?new=1&due=${selected}`;

  const courses = clear($('#courses'));
  for (const course of [...new Set(assignments.map((a) => a.course))].sort()) courses.append(tint(h('span.chip', course), course));
}

$('#prev').addEventListener('click', () => {
  cursor.setMonth(cursor.getMonth() - 1);
  render();
});
$('#next').addEventListener('click', () => {
  cursor.setMonth(cursor.getMonth() + 1);
  render();
});
$('#today').addEventListener('click', () => {
  cursor = new Date();
  cursor.setDate(1);
  selected = isoDay();
  render();
});

try {
  ({ assignments } = await api.get('/assignments'));
} catch (err) {
  toastError(err);
}
render();
