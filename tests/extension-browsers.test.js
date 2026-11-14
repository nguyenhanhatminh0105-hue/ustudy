import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBrowser, isPhone, BROWSERS, BROWSER_IDS, DOWNLOADS, guideUrl, browserFromQuery } from '../web/src/lib/extension-browsers.js';

// Real identities, read from the installed browsers (Opera GX 139, Edge 157, Chrome 157).
const CHROMIUM_UA = (extra = '') => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36${extra}`;
const SEEN = {
  'opera-gx': { userAgent: CHROMIUM_UA(' OPR/139.0.0.0'), brands: ['Opera GX', 'Chromium', 'Not(A:Brand'] },
  opera: { userAgent: CHROMIUM_UA(' OPR/120.0.0.0'), brands: ['Opera', 'Chromium', 'Not(A:Brand'] },
  edge: { userAgent: CHROMIUM_UA(' Edg/157.0.0.0'), brands: ['Not-A.Brand', 'Microsoft Edge', 'Chromium'] },
  brave: { userAgent: CHROMIUM_UA(), brands: ['Brave', 'Chromium', 'Not-A.Brand'] },
  chrome: { userAgent: CHROMIUM_UA(), brands: ['Not-A.Brand', 'Google Chrome', 'Chromium'] },
};

test('each supported browser is recognised from what it reports', () => {
  for (const [id, seen] of Object.entries(SEEN)) assert.equal(detectBrowser(seen), id, id);
});

test('browsers that only send a user-agent string are still recognised', () => {
  assert.equal(detectBrowser({ userAgent: SEEN['opera-gx'].userAgent }), 'opera');
  assert.equal(detectBrowser({ userAgent: SEEN.edge.userAgent }), 'edge');
  assert.equal(detectBrowser({ userAgent: SEEN.chrome.userAgent }), 'chrome');
  assert.equal(detectBrowser({ userAgent: SEEN.chrome.userAgent, hasBraveApi: true }), 'brave');
});

test('unsupported browsers are not mistaken for a supported one', () => {
  const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const iphoneChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
  const firefox = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0';
  assert.equal(detectBrowser({ userAgent: safari }), null);
  assert.equal(detectBrowser({ userAgent: firefox }), null, 'Firefox is not supported');
  assert.equal(detectBrowser({ userAgent: iphoneChrome }), null);
  assert.equal(detectBrowser({}), null);
  assert.equal(detectBrowser(), null);
});

test('every supported browser has a name, a download and at least three steps', () => {
  assert.deepEqual([...BROWSER_IDS].sort(), ['brave', 'chrome', 'edge', 'opera', 'opera-gx']);
  for (const id of BROWSER_IDS) {
    const b = BROWSERS[id];
    assert.equal(typeof b.name, 'string', id);
    assert.equal(b.download, 'chromium', id);
    assert.ok(Array.isArray(b.steps) && b.steps.length >= 3, id);
    for (const step of b.steps) {
      assert.ok(step.title && typeof step.title === 'string', `${id} step title`);
      assert.ok(step.body && typeof step.body === 'string', `${id} step body`);
    }
  }
  assert.equal(BROWSERS['opera-gx'].name, 'Opera GX');
  assert.equal(BROWSERS.edge.name, 'Microsoft Edge');
});

test('each browser points at its own extensions page', () => {
  assert.equal(BROWSERS.chrome.extensionsUrl, 'chrome://extensions');
  assert.equal(BROWSERS.opera.extensionsUrl, 'opera://extensions');
  assert.equal(BROWSERS['opera-gx'].extensionsUrl, 'opera://extensions');
  assert.equal(BROWSERS.edge.extensionsUrl, 'edge://extensions');
  assert.equal(BROWSERS.brave.extensionsUrl, 'brave://extensions');
});

test('every browser loads the zip unpacked', () => {
  for (const id of BROWSER_IDS) {
    const text = BROWSERS[id].steps.map((s) => `${s.title} ${s.body}`).join(' ');
    assert.match(text, /Developer mode/, id);
    assert.match(text, /Load unpacked/, id);
    assert.match(text, /unzip|extract/i, id);
  }
  assert.equal(BROWSERS.firefox, undefined);
});

test('download files and guide links', () => {
  assert.deepEqual(DOWNLOADS, { chromium: '/downloads/ustudy-extension.zip' });
  assert.equal(guideUrl('opera-gx'), '/extension-guide.html?browser=opera-gx');
});

test('the guide page reads the browser from its address, ignoring anything unknown', () => {
  assert.equal(browserFromQuery('?browser=edge', 'chrome'), 'edge');
  assert.equal(browserFromQuery('?browser=opera-gx&x=1', null), 'opera-gx');
  assert.equal(browserFromQuery('?browser=netscape', 'chrome'), 'chrome');
  assert.equal(browserFromQuery('?browser=firefox', 'chrome'), 'chrome');
  assert.equal(browserFromQuery('?browser=__proto__', 'edge'), 'edge');
  assert.equal(browserFromQuery('?browser=toString', 'edge'), 'edge');
  assert.equal(browserFromQuery('', null), null);
});

test('phones and tablets are not offered the desktop install, whatever the browser', () => {
  const androidChrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const androidTabletEdge = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 EdgA/126.0.0.0';
  const androidOpera = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 OPR/83.0.0.0';
  assert.equal(detectBrowser({ userAgent: androidChrome, brands: ['Google Chrome', 'Chromium'] }), null);
  assert.equal(detectBrowser({ userAgent: androidTabletEdge }), null);
  assert.equal(detectBrowser({ userAgent: androidOpera, brands: ['Opera', 'Chromium'] }), null);
  assert.equal(detectBrowser({ userAgent: SEEN.chrome.userAgent, brands: SEEN.chrome.brands, mobile: true }), null, 'navigator.userAgentData.mobile');
});

test('isPhone tells phones and tablets apart from computers', () => {
  assert.equal(isPhone({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }), true);
  assert.equal(isPhone({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' }), true);
  assert.equal(isPhone({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1' }), true);
  assert.equal(isPhone({ userAgent: SEEN.chrome.userAgent, mobile: true }), true);
  assert.equal(isPhone({ userAgent: SEEN.chrome.userAgent }), false);
  assert.equal(isPhone({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0' }), false, 'desktop Firefox is unsupported, not a phone');
  assert.equal(isPhone(), false);
});

test('the guide link can say the download has just started', () => {
  assert.equal(guideUrl('edge'), '/extension-guide.html?browser=edge');
  assert.equal(guideUrl('edge', { downloaded: true }), '/extension-guide.html?browser=edge&downloaded=1');
  assert.equal(guideUrl('opera-gx', { downloaded: false }), '/extension-guide.html?browser=opera-gx');
});

test('the address to copy is its own field on the step that needs it', () => {
  for (const id of BROWSER_IDS) {
    const withCopy = BROWSERS[id].steps.filter((s) => s.copy);
    assert.equal(withCopy.length, 1, `${id} has exactly one step with an address to copy`);
    assert.equal(withCopy[0].copy, BROWSERS[id].extensionsUrl, id);
    assert.ok(!withCopy[0].body.includes(BROWSERS[id].extensionsUrl), `${id}: the address is shown once, in the copy box, not repeated in the sentence`);
  }
});

test('the Developer mode step reassures, in plain words', () => {
  for (const id of BROWSER_IDS) {
    const step = BROWSERS[id].steps.find((s) => /Developer mode/.test(s.title));
    assert.ok(step, `${id} has a Developer mode step`);
    assert.equal(typeof step.note, 'string', `${id}: the Developer mode step has a reassurance note`);
    assert.match(step.note, /store/i, 'says it is about extensions from outside the store');
    assert.match(step.note, /switch(es)? (it )?off|turn(s)? (it )?off/i, 'says turning it off later switches UStudy Garden off');
    assert.ok(step.note.length <= 280, `${id}: the note stays short (${step.note.length} characters)`);
  }
});

test('unzipping covers Windows and Mac, and keeps the folder out of Downloads', () => {
  for (const id of BROWSER_IDS) {
    const first = `${BROWSERS[id].steps[0].title} ${BROWSERS[id].steps[0].body}`;
    assert.match(first, /Extract All/, `${id} Windows`);
    assert.match(first, /Mac/, `${id} Mac`);
    assert.match(first, /Documents/, `${id}: suggests a safe place, Documents`);
  }
});
