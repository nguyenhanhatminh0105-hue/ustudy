import '../styles/today.css';
import '../styles/garden.css';
import { initApp } from '../lib/shell.js';
import { gardenNight } from '../lib/theme.js';
import { api } from '../lib/api.js';
import { $, $$, busy, clear, h } from '../lib/dom.js';
import { formatDay, formatTime } from '../lib/format.js';
import { activityCaption, companionName } from '../lib/companion.js';
import { toast, toastError } from '../lib/toast.js';
import { mountGarden, snapshotGarden } from '../garden/index.js';

const shell = await initApp('garden');
let progress = shell.user.progress;

const caption = $('#caption');
let lastCaption = '';
const garden = mountGarden($('#garden'), {
  companion: progress.companion,
  stage: progress.stage,
  night: gardenNight(),
  onEvent: (e) => {
    if (e.type !== 'state') return;
    const text = activityCaption(e.name, progress);
    if (text !== lastCaption) caption.textContent = lastCaption = text;
  },
});
window.addEventListener('ustudy:theme', () => garden.setNight(gardenNight()));

const STAGES = [
  ['baby', 0],
  ['child', 150],
  ['teen', 450],
  ['adult', 1000],
];
const BLURBS = {
  turtle: {
    baby: 'Just hatched, still wearing a piece of its egg. Lives by a puddle and one warm pebble.',
    child: 'Paddles in its first moss pond and naps on sun-warmed stones.',
    teen: 'Wears a scarf, feeds the koi, and knows every stone in the garden.',
    adult: 'Carries a bonsai on its shell. A waterfall pond and a maple tree are home now.',
  },
  panda: {
    baby: 'A fluffball with a leaf on its head, napping between bamboo shoots.',
    child: 'Chews bamboo sticks in a young grove and rolls down the moss.',
    teen: 'Headphones on, climbing bamboo between study sessions.',
    adult: 'Wears a straw hat and meditates in the tea pavilion under the mountains.',
  },
};

function paintNameplate() {
  $('#name').textContent = companionName(progress);
  $('#stage-line').textContent = progress.nextStage
    ? `A ${progress.stage} ${progress.companion} with ${progress.xp} growth. Grows into ${progress.nextStage === 'adult' ? 'an adult' : `a ${progress.nextStage}`} at ${progress.nextStageXp}.`
    : `A fully grown ${progress.companion} with ${progress.xp} growth.`;
  for (const r of $$('input[name="companion"]')) r.checked = r.value === progress.companion;
}

function update(next) {
  const grew = next.stageIndex !== progress.stageIndex || next.companion !== progress.companion;
  progress = next;
  shell.setProgress(next);
  paintNameplate();
  if (grew) {
    garden.setCompanion(next.companion);
    garden.grow(next.stage);
    renderJourney();
  }
  renderTreats();
}

// ── rename ──────────────────────────────────────────────────────
const renameForm = $('#rename-form');
$('#rename').addEventListener('click', () => {
  renameForm.hidden = false;
  $('.nameplate-row').hidden = true;
  renameForm.companionName.value = companionName(progress);
  renameForm.companionName.select();
});
const closeRename = () => {
  renameForm.hidden = true;
  $('.nameplate-row').hidden = false;
  $('#rename').focus();
};
$('#rename-cancel').addEventListener('click', closeRename);
renameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { user } = await api.patch('/auth/me', { companionName: renameForm.companionName.value });
    update(user.progress);
    toast(`Say hello to ${companionName(user.progress)}`);
    garden.celebrate();
    closeRename();
  } catch (err) {
    toastError(err);
  }
});

// ── treats ──────────────────────────────────────────────────────
const TREAT_ART = {
  milk: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M15 6h10v5l3 5v18H12V16l3-5z" fill="#fbfaf6"/><path d="M12 22h16" stroke="#7fb6c9" stroke-width="5"/><path d="M15 6h10"/></svg>`,
  cookie: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2"><circle cx="20" cy="20" r="13" fill="#d39a57"/><g fill="#4a2f1f" stroke="none"><circle cx="15" cy="15" r="2"/><circle cx="24" cy="17" r="2"/><circle cx="18" cy="25" r="2"/><circle cx="26" cy="25" r="1.6"/></g></svg>`,
  cake: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 31 33 20v11z" fill="#f3e2b8"/><path d="M7 31 33 20l-2-3L6 27z" fill="#fbfaf6"/><circle cx="25" cy="15" r="3.5" fill="#e2483d"/></svg>`,
};
let treats = [];
function treatArt(id) {
  const span = h('span.treat-art', { 'aria-hidden': 'true' });
  span.innerHTML = TREAT_ART[id]; // static, authored SVG; no user content
  return span;
}
function renderTreats() {
  const list = clear($('#treats'));
  for (const t of treats) {
    const short = t.cost - progress.coins;
    const give = h(
      'button.btn',
      { type: 'button', disabled: short > 0 },
      short > 0 ? `${short} more coins needed` : `Give ${t.name.toLowerCase()}`,
    );
    give.addEventListener('click', async () => {
      busy(give);
      try {
        const result = await api.post('/companion/gifts', { treat: t.id });
        const before = progress;
        shell.setProgress(result.progress);
        await garden.gift(t.id); // watch them eat it
        if (result.progress.stageIndex > before.stageIndex) {
          toast({ title: `${companionName(result.progress)} grew up!`, icon: 'sprout', reward: { xp: t.xp } });
        } else {
          toast({ title: `${companionName(result.progress)} loved the ${t.name.toLowerCase()}`, icon: 'gift', reward: { xp: t.xp } });
        }
        update(result.progress);
        loadLedger();
      } catch (err) {
        toastError(err);
        busy(give, false);
      }
    });
    list.append(
      h(
        'li.treat',
        treatArt(t.id),
        h('div', h('h3', t.name), h('p', h('span.price', `${t.cost} coins`), ` · +${t.xp} growth`)),
        give,
      ),
    );
  }
}

// ── growing up ──────────────────────────────────────────────────
function renderJourney() {
  const list = clear($('#journey'));
  const toNext = progress.nextStageXp ? progress.nextStageXp - progress.xp : 0;
  $('#journey-meta').textContent = progress.nextStage ? `${toNext} growth to ${progress.nextStage}` : 'Every stage reached';
  const night = gardenNight();
  for (const [stage, minXp] of STAGES) {
    const reached = progress.xp >= minXp;
    const current = stage === progress.stage;
    const img = h('img', { alt: reached ? `${progress.companion} as a ${stage} in its garden` : `Locked: the ${stage} stage`, width: 320, height: 220 });
    list.append(
      h(
        `li${current ? '.current' : ''}${reached ? '' : '.locked'}`,
        h('figure', img),
        h('h3', stage[0].toUpperCase() + stage.slice(1), h('small', reached ? (current ? 'Now' : 'Reached') : `at ${minXp}`)),
        h('p', reached ? BLURBS[progress.companion][stage] : 'Keep studying to find out.'),
      ),
    );
    // Render thumbnails one per frame so the page stays responsive.
    requestAnimationFrame(() => {
      img.src = snapshotGarden({ companion: progress.companion, stage, night });
    });
  }
}

// ── ledger ──────────────────────────────────────────────────────
const KIND = {
  assignment_complete: 'Finished an assignment',
  focus: 'Focus session',
  habit_checkin: 'Habit check-in',
  gift: 'Gave a treat',
  seed: 'Sample starting progress',
};
async function loadLedger() {
  try {
    const { events } = await api.get('/companion/activity');
    const list = clear($('#ledger'));
    if (!events.length) {
      list.append(h('li', 'Nothing yet. Finish something and it will show up here.'));
      return;
    }
    for (const e of events.slice(0, 12)) {
      list.append(
        h(
          'li',
          h('span', KIND[e.kind] ?? e.kind, ' ', h('time', { datetime: e.created_at }, `· ${formatDay(e.created_at)}, ${formatTime(e.created_at)}`)),
          h('span.xp', e.xp ? `+${e.xp}` : ''),
          h('span.coins', e.coins ? `${e.coins > 0 ? '+' : '−'}${Math.abs(e.coins)} coins` : ''),
        ),
      );
    }
  } catch (err) {
    toastError(err);
  }
}

// ── switch companion ────────────────────────────────────────────
for (const radio of $$('input[name="companion"]')) {
  radio.addEventListener('change', async () => {
    try {
      const { user } = await api.patch('/auth/me', { companion: radio.value });
      update(user.progress);
      toast(`Meet your ${radio.value}`);
    } catch (err) {
      toastError(err);
    }
  });
}

paintNameplate();
try {
  ({ treats } = await api.get('/companion/treats'));
} catch {
  treats = [];
}
renderTreats();
renderJourney();
loadLedger();
window.addEventListener('pagehide', () => garden.destroy());
