import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

const base = { NODE_ENV: 'test', JWT_SECRET: 'test-secret-'.padEnd(48, 'x') };
const quiet = { info() {}, warn() {}, error() {} };

test('no proxy is trusted unless the host says so', () => {
  assert.equal(loadConfig(base).trustProxy, 0);
  assert.equal(loadConfig({ ...base, TRUST_PROXY: '1' }).trustProxy, 1);
  assert.throws(() => loadConfig({ ...base, TRUST_PROXY: 'yes' }), /TRUST_PROXY/);
});

test('a forwarded address is only believed behind a trusted proxy', () => {
  const seenBy = (env) => {
    const app = createApp({ db: null, config: loadConfig({ ...base, ...env }), log: quiet });
    return app.get('trust proxy fn')('10.0.0.1', 0);
  };
  assert.equal(seenBy({}), false);
  assert.equal(seenBy({ TRUST_PROXY: '1' }), true);
});

test('production still refuses to start without a secret', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /JWT_SECRET is required/);
});
