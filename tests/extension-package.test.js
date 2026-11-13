import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { zipDirectory } from '../scripts/package-extension.mjs';

// A small reader for the zip format, so the test does not trust the writer's own bookkeeping.
function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'end-of-archive record is present');
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i += 1) {
    assert.equal(buffer.readUInt32LE(at), 0x02014b50);
    const method = buffer.readUInt16LE(at + 10);
    const packed = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(dataStart, dataStart + packed);
    files[name] = method === 8 ? inflateRawSync(raw) : raw;
    assert.equal(files[name].length, size, name);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ustudy-zip-'));
  mkdirSync(join(dir, 'assets'));
  mkdirSync(join(dir, 'icons'));
  writeFileSync(join(dir, 'manifest.json'), '{"name":"UStudy Garden"}');
  writeFileSync(join(dir, 'assets', 'popup.js'), 'console.log("hi");\n'.repeat(500));
  writeFileSync(join(dir, 'icons', 'icon16.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 1, 2]));
  writeFileSync(join(dir, 'empty.txt'), '');
  return dir;
}

test('the zip holds every file with its contents, using forward-slash paths', () => {
  const dir = fixture();
  const out = join(mkdtempSync(join(tmpdir(), 'ustudy-out-')), 'extension.zip');
  const names = zipDirectory(dir, out);
  const files = readZip(readFileSync(out));
  assert.deepEqual(Object.keys(files).sort(), ['assets/popup.js', 'empty.txt', 'icons/icon16.png', 'manifest.json']);
  assert.deepEqual(names.sort(), Object.keys(files).sort());
  assert.equal(files['manifest.json'].toString(), '{"name":"UStudy Garden"}');
  assert.equal(files['assets/popup.js'].toString(), 'console.log("hi");\n'.repeat(500));
  assert.deepEqual([...files['icons/icon16.png']], [0x89, 0x50, 0x4e, 0x47, 0, 255, 1, 2]);
  assert.equal(files['empty.txt'].length, 0);
});

test('manifest.json sits at the top level, where the browser looks for it', () => {
  const dir = fixture();
  const out = join(mkdtempSync(join(tmpdir(), 'ustudy-out-')), 'extension.zip');
  zipDirectory(dir, out);
  assert.ok('manifest.json' in readZip(readFileSync(out)));
});

test('repeated text is compressed', () => {
  const dir = fixture();
  const out = join(mkdtempSync(join(tmpdir(), 'ustudy-out-')), 'extension.zip');
  zipDirectory(dir, out);
  assert.ok(readFileSync(out).length < 2000);
});

test('the shipped manifest allows the hosted server and asks before any other', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../extension/public/manifest.json', import.meta.url), 'utf8'));
  const { HOSTED_SERVER } = await import('../extension/src/server.js');
  assert.ok(manifest.host_permissions.includes(`${HOSTED_SERVER}/*`));
  assert.ok(manifest.host_permissions.includes('http://localhost:3000/*'));
  assert.deepEqual(manifest.optional_host_permissions, ['https://*/*', 'http://*/*']);
  assert.ok(manifest.permissions.every((p) => ['storage', 'alarms'].includes(p)), 'no new always-on permissions');
  const csp = manifest.content_security_policy.extension_pages;
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /connect-src[^;]*https:/);
});
