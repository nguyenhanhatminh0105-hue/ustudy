/**
 * Treats you can give your companion. Prices live only here; the client
 * sends a treat id, never an amount.
 */
export const TREATS = {
  milk: { id: 'milk', name: 'Warm milk', cost: 20, xp: 6 },
  cookie: { id: 'cookie', name: 'Cookie', cost: 50, xp: 15 },
  cake: { id: 'cake', name: 'Slice of cake', cost: 100, xp: 35 },
};

export function getTreat(id) {
  return Object.hasOwn(TREATS, id) ? TREATS[id] : null;
}
