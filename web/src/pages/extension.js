import '../styles/extension.css';
import { initApp } from '../lib/shell.js';
import { $ } from '../lib/dom.js';
import { hydrateIcons } from '../lib/icons.js';
import { toast } from '../lib/toast.js';

await initApp('extension');
hydrateIcons($('#main'));

// Each Chromium browser has its own address for the extensions page.
const ua = navigator.userAgent;
const brands = navigator.userAgentData?.brands?.map((b) => b.brand) ?? [];
const browser = /OPR\//.test(ua) || brands.some((b) => /Opera/.test(b))
  ? { name: 'Opera', url: 'opera://extensions', devWhere: ' (top right)' }
  : /Edg\//.test(ua)
    ? { name: 'Edge', url: 'edge://extensions', devWhere: ' (left side)' }
    : brands.includes('Brave') || navigator.brave
      ? { name: 'Brave', url: 'brave://extensions', devWhere: ' (top right)' }
      : /Chrome\//.test(ua)
        ? { name: 'Chrome', url: 'chrome://extensions', devWhere: ' (top right)' }
        : null;

if (browser) {
  $('#ext-url').textContent = browser.url;
  $('#dev-where').textContent = browser.devWhere;
} else {
  $('#unsupported').hidden = false;
}

$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#ext-url').textContent);
    toast({ title: 'Copied', body: 'Paste it into the address bar.' });
  } catch {
    toast({ title: 'Couldn’t copy', body: `Type ${$('#ext-url').textContent} into the address bar instead.`, tone: 'error' });
  }
});

// After the download starts, point at the next step.
$('#download').addEventListener('click', () => {
  $('#steps').classList.add('started');
  $('#step-1').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
});

// Version and size come from the build; without them the download is missing.
try {
  const res = await fetch('/downloads/ustudy-extension.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('missing');
  const info = await res.json();
  const size = info.bytes >= 1e6 ? `${(info.bytes / 1e6).toFixed(1)} MB` : `${Math.round(info.bytes / 1e3)} KB`;
  $('#meta').textContent = `Version ${info.version} · ${size} · ${browser ? `for ${browser.name}` : 'for Chrome, Edge, Opera and Brave'}`;
} catch {
  $('#download').setAttribute('aria-disabled', 'true');
  $('#download').removeAttribute('href');
  $('#missing').hidden = false;
}
