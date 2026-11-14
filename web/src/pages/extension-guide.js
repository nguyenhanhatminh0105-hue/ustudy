import '../styles/extension-guide.css';
import { initApp } from '../lib/shell.js';
import { $, h } from '../lib/dom.js';
import { hydrateIcons } from '../lib/icons.js';
import { toast } from '../lib/toast.js';
import { companionName } from '../lib/companion.js';
import { portraitCanvas } from '../garden/index.js';
import { BROWSER_IDS, BROWSERS, DOWNLOADS, detectBrowser, isPhone, browserFromQuery, guideUrl } from '../lib/extension-browsers.js';

const { user } = await initApp('extension');
const page = $('.page', $('#main'));
const progress = user.progress;
const name = companionName(progress);

const seen = {
  userAgent: navigator.userAgent,
  brands: navigator.userAgentData?.brands?.map((b) => b.brand) ?? [],
  hasBraveApi: Boolean(navigator.brave),
  mobile: Boolean(navigator.userAgentData?.mobile),
};
const detected = detectBrowser(seen);
const phone = isPhone(seen);
const downloaded = new URLSearchParams(location.search).get('downloaded') === '1';
let current = browserFromQuery(location.search, detected ?? 'chrome');

const fileName = (id) => DOWNLOADS[BROWSERS[id].download].split('/').pop();

// The student's own companion greets them. The portrait needs WebGL; without it the page simply goes on.
function companionPortrait(size) {
  const frame = h('div.guide-companion', { 'aria-hidden': 'true' });
  try {
    frame.append(portraitCanvas({ companion: progress.companion, stage: progress.stage, size: size * 2 }));
  } catch {
    frame.hidden = true;
  }
  return frame;
}

const header = h(
  'header.page-head.guide-head',
  companionPortrait(96),
  h(
    'div',
    h('h1', 'Plant UStudy Garden in your toolbar'),
    h('p', downloaded
      ? `${name} will walk you through it. Your download has started: it takes about a minute from here.`
      : h('span', `${name} will walk you through it. If you haven't downloaded it yet, `, h('a', { href: '/extension.html' }, 'get it from the Extension page'), ' first.')),
  ),
);

const notice = h('p.guide-notice', { hidden: detected !== null },
  phone
    ? 'Extensions only work on a computer. Open this page on your laptop in Chrome, Edge, Brave or Opera.'
    : "This browser can't run UStudy Garden. Open this page in Chrome, Edge, Brave or Opera.");

const picker = h('div.guide-picker', { role: 'group', 'aria-label': 'Your browser' },
  BROWSER_IDS.map((id) => h('button', { type: 'button', 'aria-pressed': String(id === current), 'data-id': id, onclick: () => choose(id) }, BROWSERS[id].name)));

const stepsTitle = h('h2.visually-hidden');
const steps = h('ol.guide-steps', { role: 'list' });
const announcer = h('p.visually-hidden', { 'aria-live': 'polite' });

const after = h(
  'section.panel.guide-after',
  h('h2', `${name} is waiting in your toolbar`),
  h('p', `Click UStudy Garden in your toolbar to see ${name}, your coins and growth, and what's due next, from the UStudy you're signed in to here.`),
  h('p', 'It only reads your UStudy: it never changes your assignments or spends your coins.'),
);

page.append(header, notice, picker, stepsTitle, steps, announcer, after);
hydrateIcons(header);

async function copyAddress(address) {
  try {
    await navigator.clipboard.writeText(address);
    toast({ title: 'Copied', body: 'Paste it into the address bar.' });
  } catch {
    toast({ title: "Couldn't copy", body: 'Select the address and copy it yourself.', tone: 'error' });
  }
}

function stepItem(step, index) {
  const content = h('div.guide-step-body', h('h3', step.title), h('p', step.body));
  if (index === 0) {
    content.append(h('p.guide-again', 'No download? ', h('a', { href: DOWNLOADS[BROWSERS[current].download], download: fileName(current) }, 'Download it again')));
  }
  if (step.copy) {
    content.append(h('div.guide-copy', h('code', step.copy), h('button.btn.btn-quiet', { type: 'button', onclick: () => copyAddress(step.copy) }, h('i', { 'data-icon': 'copy' }), 'Copy')));
  }
  if (step.note) {
    content.append(h('aside.guide-note', h('i', { 'data-icon': 'leaf' }), h('p', step.note)));
  }
  return h('li', h('span.guide-num', { 'aria-hidden': 'true' }, String(index + 1)), content);
}

function renderSteps() {
  stepsTitle.textContent = `Steps for ${BROWSERS[current].name}`;
  steps.replaceChildren(...BROWSERS[current].steps.map(stepItem));
  hydrateIcons(steps);
}

function choose(id) {
  current = id;
  for (const button of picker.children) button.setAttribute('aria-pressed', String(button.dataset.id === id));
  history.replaceState(null, '', guideUrl(id, { downloaded }));
  renderSteps();
  announcer.textContent = `Showing the steps for ${BROWSERS[id].name}.`;
}

renderSteps();
