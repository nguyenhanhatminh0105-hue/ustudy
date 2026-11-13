import '../styles/extension.css';
import { initApp } from '../lib/shell.js';
import { $ } from '../lib/dom.js';
import { hydrateIcons } from '../lib/icons.js';
import { BROWSER_IDS, BROWSERS, DOWNLOADS, detectBrowser, guideUrl } from '../lib/extension-browsers.js';

await initApp('extension');
hydrateIcons($('#main'));

const detected = detectBrowser({ userAgent: navigator.userAgent, brands: navigator.userAgentData?.brands?.map((b) => b.brand) ?? [], hasBraveApi: Boolean(navigator.brave), mobile: Boolean(navigator.userAgentData?.mobile) });

if (detected === null) {
  $('#unsupported').hidden = false;
}

const browserSelect = $('#confirm-browser');
for (const id of BROWSER_IDS) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = BROWSERS[id].name;
  browserSelect.appendChild(option);
}
browserSelect.value = detected ?? 'chrome';

function updateConfirmText() {
  const id = browserSelect.value;
  const downloadKey = BROWSERS[id].download;
  const downloadUrl = DOWNLOADS[downloadKey];
  const fileName = downloadUrl.split('/').pop();
  $('#confirm-text').textContent = `This downloads ${fileName} for ${BROWSERS[id].name}.`;
}
updateConfirmText();

browserSelect.addEventListener('change', updateConfirmText);

$('#download').addEventListener('click', () => {
  $('#confirm-download').showModal();
});

$('#confirm-go').addEventListener('click', () => {
  const id = browserSelect.value;
  const downloadKey = BROWSERS[id].download;
  const downloadUrl = DOWNLOADS[downloadKey];
  const fileName = downloadUrl.split('/').pop();

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  $('#confirm-download').close();

  const tab = window.open(guideUrl(id), '_blank');
  if (tab === null) {
    location.assign(guideUrl(id));
  }
});

try {
  const res = await fetch('/downloads/ustudy-extension.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('missing');
  const info = await res.json();
  const size = info.bytes >= 1e6 ? `${(info.bytes / 1e6).toFixed(1)} MB` : `${Math.round(info.bytes / 1e3)} KB`;
  $('#meta').textContent = `Version ${info.version} · ${size} · ${detected ? `for ${BROWSERS[detected].name}` : 'for Chrome, Edge, Opera and Brave'}`;
} catch {
  $('#download').disabled = true;
  $('#missing').hidden = false;
}
