import '../styles/extension-guide.css';
import { initApp } from '../lib/shell.js';
import { $, h } from '../lib/dom.js';
import { hydrateIcons } from '../lib/icons.js';
import { toast } from '../lib/toast.js';
import {
  BROWSER_IDS,
  BROWSERS,
  DOWNLOADS,
  detectBrowser,
  browserFromQuery,
  guideUrl
} from '../lib/extension-browsers.js';

await initApp('extension');

const page = $('.page', $('#main'));

// Detect browser and get current selection
const detected = detectBrowser({
  userAgent: navigator.userAgent,
  brands: navigator.userAgentData?.brands?.map((b) => b.brand) ?? [],
  hasBraveApi: Boolean(navigator.brave),
  mobile: Boolean(navigator.userAgentData?.mobile)
});

let current = browserFromQuery(location.search, detected ?? 'chrome');

// Build the page structure once
const header = h('header.page-head');
header.append(
  h('h1', {}, 'Install UStudy Garden'),
  h('p', {}, "Your download should have started. Follow the steps for your browser."),
  h('a.btn.btn-primary', {
    href: DOWNLOADS[BROWSERS[current].download],
    download: true
  }, h('i', { 'data-icon': 'download' }), ' Download again')
);

const notice = h('p.guide-notice', { hidden: detected !== null }, "This browser can't run the UStudy extension. Use one of the browsers below.");

const picker = h('div.guide-picker', { role: 'group', 'aria-label': 'Your browser' });
for (const id of BROWSER_IDS) {
  const btn = h('button.guide-browser-btn', {
    type: 'button',
    'aria-pressed': String(id === current),
    'data-id': id
  }, BROWSERS[id].name);
  picker.append(btn);
}

const steps = h('ol.guide-steps');

const afterPanel = h('section.panel.guide-after');
afterPanel.append(
  h('h2', {}, 'Then open it'),
  h('p', {}, "Click the UStudy icon in your toolbar. It shows your companion, your coins and growth, and the next things due, from the UStudy you're signed in to here."),
  h('p', {}, "The extension only looks: it never changes your assignments or spends your coins.")
);

page.append(header, notice, picker, steps, afterPanel);
hydrateIcons(header);

// Function to render steps for current browser
function renderSteps() {
  steps.replaceChildren();
  const browserSteps = BROWSERS[current].steps;
  browserSteps.forEach((step, index) => {
    const li = h('li');
    const badge = h('span.guide-num', { 'aria-hidden': 'true' }, String(index + 1));
    const content = h('div');
    content.append(
      h('h3', {}, step.title),
      h('p', {}, step.body)
    );
    li.append(badge, content);

    // Check if body contains extensionsUrl
    if (step.body.includes(BROWSERS[current].extensionsUrl)) {
      const copyRow = h('div.guide-copy');
      const code = h('code', {}, BROWSERS[current].extensionsUrl);
      const copyBtn = h('button.btn.btn-quiet', { type: 'button' }, h('i', { 'data-icon': 'copy' }), ' Copy');

      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(BROWSERS[current].extensionsUrl);
          toast({ title: 'Copied', body: 'Paste it into the address bar.' });
        } catch {
          toast({ title: "Couldn't copy", body: 'Type it into the address bar instead.', tone: 'error' });
        }
      });

      copyRow.append(code, copyBtn);
      li.append(copyRow);
    }

    steps.append(li);
  });
  hydrateIcons(steps);
}

// Function to update picker buttons and download link
function updatePickerAndDownload() {
  const downloadLink = $('.btn-primary', header);
  downloadLink.href = DOWNLOADS[BROWSERS[current].download];

  for (const btn of picker.children) {
    const id = btn.dataset.id;
    btn.setAttribute('aria-pressed', String(id === current));
  }
}

// Add click handlers to picker buttons
for (const btn of picker.children) {
  btn.addEventListener('click', () => {
    current = btn.dataset.id;
    history.replaceState(null, '', guideUrl(current));
    renderSteps();
    updatePickerAndDownload();
  });
}

// Initial render
renderSteps();