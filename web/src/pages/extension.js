import '../styles/extension.css';
import { initApp } from '../lib/shell.js';
import { $, $$ } from '../lib/dom.js';
import { hydrateIcons } from '../lib/icons.js';
import { toast } from '../lib/toast.js';
import { companionName } from '../lib/companion.js';
import { portraitCanvas } from '../garden/index.js';
import { BROWSERS, DOWNLOADS, detectBrowser, isPhone, guideUrl } from '../lib/extension-browsers.js';

const { user } = await initApp('extension');
hydrateIcons($('#main'));

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
const browserId = detected ?? 'chrome';

// The student's own companion, in the panel and in the dialog. Without WebGL it is simply left out.
for (const frame of $$('.ext-companion')) {
  try {
    frame.append(portraitCanvas({ companion: progress.companion, stage: progress.stage, size: 128 }));
  } catch {
    frame.hidden = true;
  }
}

$('#intro').textContent = `${name} in your browser toolbar: see what’s due and how your garden is growing, without opening UStudy.`;
$('#fact-shows').textContent = `${name}, your coins and growth, and what’s due in the next two days.`;
$('#fact-expect').textContent = `installing takes about a minute by hand, with Developer mode switched on. The guide shows every step for ${BROWSERS[browserId].name}.`;

const download = $('#download');
if (phone) {
  download.hidden = true;
  $('#phone').hidden = false;
} else if (detected === null) {
  download.disabled = true;
  $('#unsupported').hidden = false;
}

$('#copy-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(`${location.origin}/extension.html`);
    toast({ title: 'Link copied', body: 'Send it to yourself and open it on your computer.' });
  } catch {
    toast({ title: "Couldn't copy", body: `Open ${location.host}/extension.html on your computer.`, tone: 'error' });
  }
});

download.addEventListener('click', () => $('#confirm-download').showModal());

// All of this runs inside the click, so the browser treats the new tab as something the student asked for.
$('#confirm-go').addEventListener('click', () => {
  const href = DOWNLOADS[BROWSERS[browserId].download];
  const link = Object.assign(document.createElement('a'), { href, download: href.split('/').pop() });
  document.body.append(link);
  link.click();
  link.remove();
  $('#confirm-download').close();

  const url = guideUrl(browserId, { downloaded: true });
  if (window.open(url, '_blank') === null) location.assign(url);
});

try {
  const res = await fetch('/downloads/ustudy-extension.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('missing');
  const info = await res.json();
  const size = info.bytes >= 1e6 ? `${(info.bytes / 1e6).toFixed(1)} MB` : `${Math.round(info.bytes / 1e3)} KB`;
  $('#meta').textContent = `Version ${info.version} · ${size} · ${detected ? `for ${BROWSERS[detected].name}` : 'for Chrome, Edge, Brave and Opera'}`;
} catch {
  download.disabled = true;
  $('#missing').hidden = false;
}
