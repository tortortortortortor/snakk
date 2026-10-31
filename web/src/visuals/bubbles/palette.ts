/** Blobmixer-ish gradient pairs. Roots take them in order; children reuse their parent's pair, lighter. */
export const PALETTE: [string, string][] = [
  ['#ff6b4a', '#ffd166'],
  ['#4f7cff', '#9be7ff'],
  ['#b45cff', '#ff8fd8'],
  ['#18c29c', '#d4ff6b'],
  ['#ff4f8b', '#ffb36b'],
  ['#3ec7ff', '#b7a6ff'],
  ['#ffb000', '#ff6bd6'],
];

export const paletteFor = (index: number): [string, string] => PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
