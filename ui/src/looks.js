// Plain data shared by the UI and the runtime (no imports): the valid looks a bot can
// have and the color themes. Drawing lives in figure.js; colors live in tokens.css.

export const SHAPE_IDS = ['round', 'soft', 'tall', 'cat', 'bear', 'bunny', 'bot', 'ghost', 'sprout', 'drop', 'cloud', 'bloom'];
export const EYE_IDS = ['classic', 'mirror', 'tall', 'wide', 'close', 'wink'];

export const COLORS = [
  ['Lilac', '#b5a3e5'], ['Indigo', '#8f9cf5'], ['Sky', '#86c5f7'], ['Mint', '#7fd8b0'], ['Lime', '#c4df7a'], ['Sun', '#f8cf63'],
  ['Peach', '#ffb088'], ['Coral', '#ff8d87'], ['Rose', '#f2a2c8'], ['Sand', '#d8c3a1'], ['Stone', '#b9b9bd'], ['Ink', '#34343a'],
];

/** A look no other bot is using yet (falls back to the least used one). */
export function freshLook(bots = [], random = Math.random) {
  const least = (ids, used) => {
    const counts = new Map(ids.map(id => [id, 0]));
    for (const u of used) if (counts.has(u)) counts.set(u, counts.get(u) + 1);
    const min = Math.min(...counts.values()), pool = ids.filter(id => counts.get(id) === min);
    return pool[Math.floor(random() * pool.length)];
  };
  return {
    shape: least(SHAPE_IDS, bots.map(b => b.shape)),
    eyes: least(EYE_IDS, bots.map(b => b.eyes)),
    color: least(['#86c5f7','#7fd8b0','#f2a2c8'], bots.map(b => String(b.color).toLowerCase())),
  };
}
