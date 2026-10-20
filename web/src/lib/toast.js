import { h } from './dom.js';
import { icon } from './icons.js';

let host;
function region() {
  if (!host) {
    host = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  return host;
}

/**
 * toast('Saved') or toast({ title, body, reward: { xp, coins }, icon, tone })
 */
export function toast(input, { duration = 4200 } = {}) {
  const opts = typeof input === 'string' ? { title: input } : input;
  const el = h(
    'div.toast',
    icon(opts.icon ?? (opts.tone === 'error' ? 'x' : 'check')),
    h(
      'div',
      h('strong', opts.title),
      opts.body ? h('span', opts.body) : null,
      opts.reward && (opts.reward.xp || opts.reward.coins)
        ? h(
            'span.reward',
            opts.reward.xp ? h('span.xp', `+${opts.reward.xp} growth`) : null,
            opts.reward.coins ? h('span.coins', `+${opts.reward.coins} coins`) : null,
          )
        : null,
    ),
  );
  region().append(el);
  setTimeout(() => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duration);
  return el;
}

export const toastError = (err) => toast({ title: 'That didn’t work', body: err?.message ?? String(err), tone: 'error' }, { duration: 6000 });
