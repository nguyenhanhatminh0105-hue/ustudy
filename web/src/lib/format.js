const DAY = 86_400_000;

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const isoDay = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const longFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

export const formatDay = (d) => dayFmt.format(new Date(d));
export const formatTime = (d) => timeFmt.format(new Date(d));
export const formatLong = (d) => longFmt.format(new Date(d));

/** "Today, 11:59 PM" / "Tomorrow" / "In 4 days" / "2 days late". */
export function dueLabel(iso, now = new Date()) {
  const due = new Date(iso);
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  const time = formatTime(due);
  if (due < now) {
    if (days === 0) return `Due today at ${time}, now late`;
    return days === -1 ? 'A day late' : `${-days} days late`;
  }
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days < 7) return `${formatDay(due)}, ${time}`;
  return formatDay(due);
}

export function dueBucket(a, now = new Date()) {
  if (a.status === 'completed') return 'done';
  const due = new Date(a.dueAt);
  if (due < now) return 'late';
  const days = (startOfDay(due) - startOfDay(now)) / DAY;
  if (days <= 0) return 'today';
  if (days < 7) return 'week';
  return 'later';
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** datetime-local input value <-> ISO with the local offset. */
export function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
