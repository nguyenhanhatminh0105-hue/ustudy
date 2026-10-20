import {
  ArrowRight, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Coins, Copy, DoorOpen, Eye, EyeOff,
  Flame, Gift, House, Leaf, ListTodo, LogOut, Monitor, Moon, Pause, Pencil, Play, Plus, RotateCcw, Send, Shield,
  Sparkles, Sprout, Square, Sun, Timer, Trash2, Users, Waves, X, createElement,
} from 'lucide';

const ICONS = {
  'arrow-right': ArrowRight, book: BookOpen, calendar: CalendarDays, check: Check, 'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight, clock: Clock, coins: Coins, copy: Copy, door: DoorOpen, eye: Eye, 'eye-off': EyeOff,
  flame: Flame, gift: Gift, home: House, leaf: Leaf, list: ListTodo, 'log-out': LogOut, monitor: Monitor, moon: Moon,
  pause: Pause, pencil: Pencil, play: Play, plus: Plus, reset: RotateCcw, send: Send, shield: Shield,
  sparkles: Sparkles, sprout: Sprout, stop: Square, sun: Sun, timer: Timer, trash: Trash2, users: Users, waves: Waves, x: X,
};

/** Returns an SVG element for a named icon. One library, one stroke weight everywhere. */
export function icon(name, { size = 18, label } = {}) {
  const svg = createElement(ICONS[name] ?? Sparkles);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('stroke-width', '1.8');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  return svg;
}

/** Replaces every <i data-icon="name"> in a subtree with its SVG. */
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('i[data-icon]')) el.replaceWith(icon(el.dataset.icon, { size: Number(el.dataset.size) || 18 }));
}

/** The UStudy mark: a garden stone with raked rings around it. */
export function brandMark() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <circle cx="20" cy="22" r="17" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="1.4"/>
    <circle cx="20" cy="22" r="12.5" fill="none" stroke="currentColor" stroke-opacity=".38" stroke-width="1.4"/>
    <path d="M11.5 23.5c0-5 4.2-9 9.2-9 4.6 0 8 3.4 8 7.6 0 3.8-3.4 5.4-8.6 5.4-5.4 0-8.6-1.2-8.6-4z" fill="var(--moss)"/>
    <path d="M15 19.5c1.5-1.7 3.6-2.6 5.8-2.6" fill="none" stroke="var(--moss-ink)" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>`;
  return svg;
}
