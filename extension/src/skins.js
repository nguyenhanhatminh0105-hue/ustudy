/**
 * Header motifs for the eight popup skins, one per companion per life
 * stage. Each is a small authored SVG in the skin's accent colour.
 */
const svg = (inner) =>
  `<svg viewBox="0 0 360 72" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55">${inner}</svg>`;

const ripples = (cx, cy, n, gap = 9) =>
  Array.from({ length: n }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${10 + i * gap}" opacity="${1 - i / (n + 1)}"/>`).join('');

export const MOTIFS = {
  turtle: {
    // eggshell crack and rising bubbles
    baby: svg(`<path d="M220 50l12-12 10 10 12-14 10 12 12-10 10 14" /><g fill="currentColor" stroke="none"><circle cx="300" cy="20" r="4"/><circle cx="318" cy="34" r="3"/><circle cx="332" cy="16" r="5"/></g>`),
    // lily pads on a pond
    child: svg(`${ripples(300, 40, 4)}<g fill="currentColor" stroke="none" opacity=".7"><path d="M250 26a12 12 0 1 0 12 0l-6 10z"/><path d="M330 54a9 9 0 1 0 9 0l-4.5 8z"/></g>`),
    // koi in raked ripples
    teen: svg(`${ripples(296, 36, 5, 8)}<path d="M268 30c10-8 24-8 32 0-8 8-22 8-32 0zm32 0l10-6v12z" fill="currentColor" stroke="none" opacity=".8"/>`),
    // maple leaves over falling water
    adult: svg(`<g opacity=".7"><path d="M250 0v72M262 0v72M274 0v72" stroke-dasharray="6 8"/></g><g fill="currentColor" stroke="none"><path d="M318 18l4 8 8-2-5 7 6 5-9 1 1 9-6-6-5 7-1-9-8 1 6-6-5-7 8 2z"/><path d="M340 44l3 6 6-1-4 5 4 4-6 1 1 6-4-4-4 5-1-6-6 1 4-5-4-5 6 1z" opacity=".7"/></g>`),
  },
  panda: {
    // sprouts
    baby: svg(`<path d="M270 72V48m0 0c-8-10-18-8-20-2 8 4 16 4 20 2zm0 0c6-12 16-12 20-6-6 6-14 8-20 6z"/><path d="M316 72V54m0 0c-6-7-13-6-15-1 6 3 12 3 15 1zm0 0c5-8 12-8 15-4-5 4-10 5-15 4z"/>`),
    // young bamboo stalks
    child: svg(`<g stroke-width="5"><path d="M262 72V18M290 72V8M318 72V26M344 72V14"/></g><g stroke="var(--sk-bg)" stroke-width="2"><path d="M258 40h8M286 30h8M314 48h8M340 36h8"/></g>`),
    // sound waves from headphones
    teen: svg(`<path d="M290 20a20 20 0 0 1 0 32"/><path d="M302 12a32 32 0 0 1 0 48"/><path d="M314 4a44 44 0 0 1 0 64"/><circle cx="276" cy="36" r="8" fill="currentColor" stroke="none"/>`),
    // mountains and mist
    adult: svg(`<path d="M220 72l40-46 24 26 26-38 50 58" fill="currentColor" stroke="none" opacity=".45"/><path d="M228 52h60M300 60h50" stroke-width="3" opacity=".6"/>`),
  },
};
