/**
 * How work turns into growth. Every reward is decided here, on the server;
 * clients never say how much XP or how many coins they earned.
 */

export const STAGES = [
  { id: 'baby', index: 1, minXp: 0 },
  { id: 'child', index: 2, minXp: 150 },
  { id: 'teen', index: 3, minXp: 450 },
  { id: 'adult', index: 4, minXp: 1000 },
];

export const COMPANIONS = ['turtle', 'panda'];

export const REWARDS = {
  // Finishing an assignment is the biggest win; bigger assignments earn a bit more.
  assignmentComplete(totalHours) {
    const hours = Math.max(1, Math.min(200, Math.floor(totalHours || 1)));
    return { xp: 30 + Math.min(hours, 20) * 2, coins: 5 + Math.min(hours, 20) };
  },
  // Focus earns per minute actually focused, so stopping early still counts.
  focusSession(minutes) {
    const m = Math.max(0, Math.min(180, Math.floor(minutes || 0)));
    if (m < 5) return { xp: 0, coins: 0 }; // too short to count
    return { xp: m, coins: Math.floor(m / 10) };
  },
  habitCheckin() {
    return { xp: 8, coins: 1 };
  },
};

/** Focus XP is capped per day so the timer can't be farmed. */
export const DAILY_FOCUS_XP_CAP = 240;

export function stageFor(xp) {
  const value = Math.max(0, Number(xp) || 0);
  let current = STAGES[0];
  for (const stage of STAGES) if (value >= stage.minXp) current = stage;
  return current;
}

/** Everything a client needs to draw the companion and its progress bar. */
export function progressSnapshot({ xp, coins, companion, companion_name: companionName }) {
  const stage = stageFor(xp);
  const next = STAGES.find((s) => s.index === stage.index + 1) ?? null;
  return {
    companion,
    companionName: companionName ?? null,
    xp,
    coins,
    stage: stage.id,
    stageIndex: stage.index,
    stageStartXp: stage.minXp,
    nextStage: next?.id ?? null,
    nextStageXp: next?.minXp ?? null,
  };
}
