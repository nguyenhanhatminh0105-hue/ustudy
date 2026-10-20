import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/shell.css';
import { api } from './api.js';
import { h, $ } from './dom.js';
import { brandMark, hydrateIcons, icon } from './icons.js';
export { gardenNight } from './theme.js';
import { THEMES, getTheme, setTheme } from './theme.js';

const NAV = [
  { id: 'today', label: 'Today', href: '/today.html', icon: 'home' },
  { id: 'assignments', label: 'Assignments', href: '/assignments.html', icon: 'list' },
  { id: 'calendar', label: 'Calendar', href: '/calendar.html', icon: 'calendar', secondary: true },
  { id: 'habits', label: 'Habits', href: '/habits.html', icon: 'sprout' },
  { id: 'focus', label: 'Focus', href: '/focus.html', icon: 'timer' },
  { id: 'garden', label: 'Garden', href: '/garden.html', icon: 'leaf' },
  { id: 'rooms', label: 'Study rooms', href: '/rooms.html', icon: 'users', secondary: true },
];

// ── progress in the rail ────────────────────────────────────────────
const STAGE_NAMES = { baby: 'Baby', child: 'Child', teen: 'Teen', adult: 'Adult' };

export function growthBar(progress) {
  const segs = [];
  for (let i = 1; i <= 4; i += 1) {
    let fill = 0;
    if (i < progress.stageIndex) fill = 1;
    else if (i === progress.stageIndex) {
      fill = progress.nextStageXp ? (progress.xp - progress.stageStartXp) / (progress.nextStageXp - progress.stageStartXp) : 1;
    }
    const span = h('span', h('i'));
    span.style.setProperty('--fill', Math.max(0, Math.min(1, fill)).toFixed(3));
    segs.push(span);
  }
  const toNext = progress.nextStageXp ? `${progress.nextStageXp - progress.xp} to ${progress.nextStage}` : 'Fully grown';
  return h(
    'div.growth',
    { title: `${progress.xp} growth points` },
    h('div.growth-label', h('b', STAGE_NAMES[progress.stage]), h('span.num', toNext)),
    h('div.bamboo-bar', { role: 'img', 'aria-label': `${STAGE_NAMES[progress.stage]} stage, ${toNext}` }, segs),
  );
}

function purse(progress) {
  return h(
    'div.purse',
    { id: 'purse' },
    h('div.purse-row', h('span', 'Coins'), h('b.coins.num', { id: 'purse-coins' }, String(progress.coins))),
    growthBar(progress),
  );
}

// ── the shell ───────────────────────────────────────────────────────
/**
 * Renders the navigation rail and loads the signed-in user.
 * Redirects to the sign-in page when there's no session.
 */
export async function initApp(pageId) {
  const rail = $('#rail');
  const { user } = await api.get('/auth/session').catch(() => ({ user: null }));
  if (!user) {
    location.assign(`/?next=${encodeURIComponent(location.pathname + location.search)}`);
    return new Promise(() => {});
  }

  const items = [...NAV];
  if (user.role === 'admin') items.push({ id: 'admin', label: 'Course admin', href: '/admin.html', icon: 'shield', secondary: true });

  const themeBtn = h('button.btn.btn-quiet.btn-icon', { type: 'button', onclick: cycleTheme });
  const paintThemeButton = () => {
    const t = getTheme();
    themeBtn.replaceChildren(icon(t === 'night' ? 'moon' : t === 'day' ? 'sun' : 'monitor'));
    themeBtn.setAttribute('aria-label', `Theme: ${t}. Change theme`);
    themeBtn.title = `Theme: ${t === 'auto' ? 'follows your system' : t}`;
  };
  function cycleTheme() {
    setTheme(THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length]);
    paintThemeButton();
  }
  paintThemeButton();

  const signOut = h(
    'button.btn.btn-quiet.btn-icon',
    {
      type: 'button',
      'aria-label': 'Sign out',
      title: 'Sign out',
      onclick: async () => {
        await api.post('/auth/logout').catch(() => {});
        location.assign('/');
      },
    },
    icon('log-out'),
  );

  rail.replaceChildren(
    h('a.brand', { href: '/today.html' }, brandMark(), 'UStudy'),
    h(
      'ul.path',
      items.map((item) =>
        h(
          `li${item.secondary ? '.secondary' : ''}`,
          h(
            'a',
            { href: item.href, 'aria-current': item.id === pageId ? 'page' : undefined },
            h('span.stone', icon(item.icon)),
            h('span', item.label),
          ),
        ),
      ),
    ),
    h('div.rail-foot', purse(user.progress), h('div.me', h('span.me-name', user.name), themeBtn, signOut)),
  );
  rail.setAttribute('aria-label', 'Main');

  // Phones: a compact top bar with the brand and coins (the rail is the bottom bar there).
  const main = $('#main');
  const more = h(
    'details.mobile-more',
    h('summary', { 'aria-label': 'More pages and settings' }, icon('more')),
    h(
      'nav.mobile-menu',
      { 'aria-label': 'More' },
      items.filter((i) => i.secondary).map((i) => h('a', { href: i.href, 'aria-current': i.id === pageId ? 'page' : undefined }, icon(i.icon), i.label)),
      h('button', { type: 'button', onclick: () => { cycleTheme(); more.open = false; } }, icon('sun'), 'Change theme'),
      h('button', { type: 'button', onclick: () => signOut.click() }, icon('log-out'), 'Sign out'),
    ),
  );
  main.prepend(
    h(
      'div.mobile-top',
      h('a.brand', { href: '/today.html' }, brandMark(), 'UStudy'),
      h('div.mobile-top-right', h('span.tag', icon('coins'), h('span.num', { id: 'mobile-coins' }, String(user.progress.coins))), more),
    ),
  );
  hydrateIcons(main);

  return {
    user,
    /** Call after any reward or purchase so the rail stays in step. */
    setProgress(progress) {
      if (!progress) return;
      user.progress = progress;
      $('#purse')?.replaceWith(purse(progress));
      const mc = $('#mobile-coins');
      if (mc) mc.textContent = String(progress.coins);
    },
  };
}
