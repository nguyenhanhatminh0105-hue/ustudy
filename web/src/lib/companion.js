import { toast } from './toast.js';

export const STAGE_LABEL = { baby: 'baby', child: 'child', teen: 'teen', adult: 'adult' };

export function companionName(progress) {
  return progress.companionName || (progress.companion === 'panda' ? 'Bao' : 'Mochi');
}

/** A short, living caption for what the companion is doing right now. */
export function activityCaption(state, progress) {
  const name = companionName(progress);
  const turtle = progress.companion === 'turtle';
  const lines = {
    idle: `${name} is taking in the garden.`,
    walk: `${name} is wandering the gravel paths.`,
    approach: `${name} is heading somewhere.`,
    swim: `${name} is swimming slow laps in the pond.`,
    bask: `${name} is basking on the warm stone.`,
    koi: `${name} is feeding the koi.`,
    nap: `${name} is napping${turtle ? '' : ' on the moss'}.`,
    sleep: `${name} is fast asleep. It’s late.`,
    eat: `${name} is munching bamboo.`,
    climb: `${name} is climbing the bamboo!`,
    meditate: `${name} is meditating in the pavilion.`,
    roll: `${name} is rolling around.`,
    paddle: `${name} is splashing at the water’s edge.`,
    pet: `${name} loved that.`,
    dizzy: `${name} is a little dizzy. Gently!`,
    held: `Whee! ${name} is up in the air.`,
    land: `${name} landed.`,
    shake: `${name} is shaking the water off.`,
    charge: `${name} is getting excited…`,
    special: turtle ? `${name} is spinning in its shell!` : `${name} did a somersault!`,
    gift: `${name} is enjoying a treat.`,
    celebrate: `${name} is cheering for you!`,
    focus: `${name} is sitting quietly with you.`,
  };
  return lines[state] ?? lines.idle;
}

/**
 * Shows a reward, keeps the rail's coins and growth in step, and lets the
 * companion react; when a life stage changes, the garden grows on screen.
 */
export function celebrateReward({ reward, progress }, { shell, garden, what = 'Nice work' } = {}) {
  if (!progress) return;
  const before = shell?.user.progress;
  shell?.setProgress(progress);
  const grew = before && progress.stageIndex > before.stageIndex;
  if (grew) {
    garden?.grow(progress.stage);
    toast(
      {
        title: `${companionName(progress)} grew into ${progress.stage === 'adult' ? 'an adult' : `a ${progress.stage}`}!`,
        body: 'Their garden grew too. Take a look.',
        icon: 'sprout',
        reward,
      },
      { duration: 7000 },
    );
    return;
  }
  garden?.celebrate();
  if (reward) toast({ title: what, reward, icon: 'sparkles' });
}
