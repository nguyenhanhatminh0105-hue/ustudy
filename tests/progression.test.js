import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REWARDS, STAGES, progressSnapshot, stageFor } from '../server/domain/progression.js';

test('life stages progress baby → child → teen → adult at their thresholds', () => {
  assert.deepEqual(STAGES.map((s) => s.id), ['baby', 'child', 'teen', 'adult']);
  for (const stage of STAGES) {
    assert.equal(stageFor(stage.minXp).id, stage.id);
    if (stage.minXp > 0) assert.notEqual(stageFor(stage.minXp - 1).id, stage.id);
  }
  assert.equal(stageFor(-50).id, 'baby');
  assert.equal(stageFor(1e9).id, 'adult');
});

test('snapshot reports the next stage, and none at adult', () => {
  const teen = progressSnapshot({ xp: 500, coins: 3, companion: 'turtle' });
  assert.equal(teen.stage, 'teen');
  assert.equal(teen.nextStage, 'adult');
  assert.equal(teen.nextStageXp, 1000);
  const adult = progressSnapshot({ xp: 5000, coins: 0, companion: 'panda' });
  assert.equal(adult.nextStage, null);
});

test('focus rewards ignore sessions under five minutes and clamp absurd values', () => {
  assert.deepEqual(REWARDS.focusSession(4), { xp: 0, coins: 0 });
  assert.deepEqual(REWARDS.focusSession(25), { xp: 25, coins: 2 });
  assert.deepEqual(REWARDS.focusSession(10_000), REWARDS.focusSession(180));
});

test('bigger assignments earn more, up to a cap', () => {
  const small = REWARDS.assignmentComplete(1);
  const big = REWARDS.assignmentComplete(20);
  assert.ok(big.xp > small.xp);
  assert.deepEqual(REWARDS.assignmentComplete(500), REWARDS.assignmentComplete(20));
});
