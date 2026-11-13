import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the guide is its own page, built by Vite and kept under the Extension tab', () => {
  assert.match(read('../vite.config.js'), /'extension-guide': page\('extension-guide'\)/);
  const html = read('../web/extension-guide.html');
  assert.match(html, /src="\.\/src\/pages\/extension-guide\.js"/);
  assert.match(html, /id="rail"/);
  assert.match(html, /<title>[^<]*Install[^<]*UStudy<\/title>/);
  const js = read('../web/src/pages/extension-guide.js');
  assert.match(js, /initApp\('extension'\)/);
  assert.match(js, /from '\.\.\/lib\/extension-browsers\.js'/);
  assert.match(js, /browserFromQuery\(/);
  assert.match(js, /history\.replaceState/);
});

test('the Extension page confirms the download, then opens the guide', () => {
  const html = read('../web/extension.html');
  assert.match(html, /<dialog[^>]*id="confirm-download"/);
  assert.doesNotMatch(html, /id="steps"/, 'the step-by-step guide moved to its own page');
  assert.match(html, /href="\/extension-guide\.html"/, 'a plain link to the guide stays on the page');
  const js = read('../web/src/pages/extension.js');
  assert.match(js, /from '\.\.\/lib\/extension-browsers\.js'/);
  assert.match(js, /detectBrowser\(/);
  assert.match(js, /showModal\(\)/);
  assert.match(js, /window\.open\(guideUrl\(/);
  assert.match(js, /location\.assign\(guideUrl\(/, 'falls back to the same tab when a pop-up is blocked');
  assert.match(js, /DOWNLOADS\[/);
});

test('page scripts give elements classes the way h() understands', () => {
  // h() treats unknown string props as attributes, so `className: 'x'` becomes a useless
  // classname="x" attribute. Classes go in the tag ('div.card') or in `class:`.
  for (const file of ['../web/src/pages/extension-guide.js', '../web/src/pages/extension.js']) {
    assert.doesNotMatch(read(file), /className\s*:/, file);
  }
});
