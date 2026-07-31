// Rewards catalogue for the token store.
//
// HARD RULE, inherited from Cosmic Guide's lib/brindes.js (which earned it via
// a real reported bug - "resgata e não dá pra usar"): an item only appears in
// this list if redeeming it produces a REAL, implemented effect somewhere in
// the app. No placeholder rewards, no "coming soon" that still charges tokens.
//
// That rule is why this catalogue is short. Tokens have been accruing since
// 2026-07-19 with nowhere to spend them; three rewards that genuinely work beat
// ten that look good in a list. Deliberately NOT included:
//   - "bonus identification": the free-use limit is enforced server-side by
//     api/_lib/entitlement.js against the device id. A locally-granted bonus
//     would be spent, then refused by the backend - the exact ghost-reward the
//     rule forbids. It needs backend work first.
//   - physical items (seeds, shells, stones - Lenda's original brainstorm):
//     promising a physical object with no logistics, address collection or
//     LGPD handling behind it is the same trap.
//
// Titles/descriptions live in i18n under `store.items.{id}.title`/`description`
// so all 17 languages stay in sync; only non-text fields are here.

// Deterministic star/speck field - seeded, never Math.random, so every user
// gets byte-identical wallpapers and the preview always matches the download.
function specks(seed, n, color, maxR) {
  let h = seed >>> 0;
  const rnd = () => {
    h = (h * 1103515245 + 12345) % 2147483648;
    return h / 2147483648;
  };
  let out = '';
  for (let i = 0; i < n; i++) {
    const cx = Math.round(rnd() * 1080);
    const cy = Math.round(rnd() * 1920);
    const r = (rnd() * maxR + 0.5).toFixed(1);
    const o = (rnd() * 0.4 + 0.12).toFixed(2);
    out += `<circle cx='${cx}' cy='${cy}' r='${r}' fill='${color}' opacity='${o}'/>`;
  }
  return out;
}

// A simple leaf: two mirrored quadratic curves plus a midrib.
function leaf(x, y, scale, rotation, fill, opacity) {
  const L = 120 * scale;
  const W = 46 * scale;
  const path =
    `M0,0 Q${W},${-L * 0.35} 0,${-L} Q${-W},${-L * 0.35} 0,0 Z`;
  return (
    `<g transform='translate(${x},${y}) rotate(${rotation})' opacity='${opacity}'>` +
    `<path d='${path}' fill='${fill}'/>` +
    `<path d='M0,0 L0,${-L}' stroke='${fill}' stroke-width='${1.5 * scale}' opacity='0.55'/>` +
    `</g>`
  );
}

function wallpaperUri({ from, to, seck, speckColor, leaves }) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='1080' height='1920' viewBox='0 0 1080 1920'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='0.6' y2='1'>` +
    `<stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>` +
    `</linearGradient></defs>` +
    `<rect width='1080' height='1920' fill='url(#g)'/>` +
    specks(seck, 70, speckColor, 2.4) +
    leaves +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Three botanical wallpapers, built from the app's own palette.
export const WALLPAPERS = [
  {
    id: 'deepFoliage',
    file: 'naturelens-folhagem-profunda',
    uri: wallpaperUri({
      from: '#1B3D2A',
      to: '#0E1512',
      seck: 101,
      speckColor: '#7FC79A',
      leaves:
        leaf(180, 1780, 3.1, -18, '#4E9F6B', 0.24) +
        leaf(890, 1860, 3.6, 22, '#3B7A52', 0.22) +
        leaf(520, 1900, 2.6, 4, '#7FC79A', 0.14),
    }),
  },
  {
    id: 'forestDawn',
    file: 'naturelens-amanhecer-na-mata',
    uri: wallpaperUri({
      from: '#E0A951',
      to: '#16281D',
      seck: 227,
      speckColor: '#FFFFFF',
      leaves:
        leaf(140, 1840, 3.8, -12, '#1B3D2A', 0.5) +
        leaf(430, 1900, 3.2, 8, '#16281D', 0.45) +
        leaf(940, 1820, 4.0, 26, '#1B3D2A', 0.42),
    }),
  },
  {
    id: 'mossMist',
    file: 'naturelens-musgo-e-nevoa',
    uri: wallpaperUri({
      from: '#5F8C74',
      to: '#111B16',
      seck: 353,
      speckColor: '#F2F5F3',
      leaves:
        leaf(700, 1880, 3.4, 16, '#2C5140', 0.3) +
        leaf(260, 1830, 2.9, -22, '#3B7A52', 0.26),
    }),
  },
];

export const REWARDS = [
  {
    id: 'streakShield',
    // 'repeatable' items can be bought again and again (they stack a counter);
    // 'onetime' items are owned forever once redeemed and reopen for free.
    kind: 'repeatable',
    cost: 60,
    icon: 'shield-checkmark',
    accent: '#5AA9C9',
  },
  {
    id: 'wallpapers',
    kind: 'onetime',
    cost: 40,
    icon: 'image',
    accent: '#4E9F6B',
    // Saving a file needs an <a download>, which only exists on the web build.
    // Same honesty rule as the rest of the catalogue: never sell an effect the
    // current platform cannot deliver.
    webOnly: true,
  },
  {
    id: 'naturalistBadge',
    kind: 'onetime',
    cost: 100,
    icon: 'ribbon',
    accent: '#E0A951',
  },
];

// What the store should actually render on this platform.
export function getAvailableRewards(isWeb) {
  return REWARDS.filter((r) => !r.webOnly || isWeb);
}

export function getReward(id) {
  return REWARDS.find((r) => r.id === id) || null;
}
