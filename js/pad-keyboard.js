/**
 * Linear row-by-row letters (physical QWERTY rows, top → bottom).
 * Row 1: Q–P, row 2: A–L, row 3: Z–M. Same sequence for battery (first 9) and pads (first N).
 */
export const PAD_KEY_LAYOUT = [
  'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',
  'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l',
  'z', 'x', 'c', 'v', 'b', 'n', 'm'
];

/** Default battery: first 9 keys of linear layout (Q W E R T Y U I O) → tom-1 … tom-9 */
export const BATTERY_DEFAULT_PAD_CHARS = PAD_KEY_LAYOUT.slice(0, 9);

/** Default pad index → letter: same linear order for all grids (no separate “extension” pool). */
export const DEFAULT_PAD_KEY_CHAR_ORDER = [...PAD_KEY_LAYOUT];

/**
 * @param {number} totalPads
 * @returns {Record<string, number>} Maps KeyQ / q (etc.) -> pad index
 */
export function buildPadKeyIndexMap(totalPads) {
  const map = Object.create(null);
  const n = Math.min(Math.max(0, totalPads), DEFAULT_PAD_KEY_CHAR_ORDER.length);
  for (let i = 0; i < n; i++) {
    const ch = DEFAULT_PAD_KEY_CHAR_ORDER[i];
    map[ch] = i;
    map['Key' + ch.toUpperCase()] = i;
  }
  return map;
}

/**
 * Resolve which pad index (if any) should trigger from a keyboard event.
 * Prefers e.code (physical key) so layouts where e.key differs still match the on-screen letter row.
 *
 * @param {KeyboardEvent} e
 * @param {Record<string, number>} keyToPadIndex
 * @returns {number|undefined}
 */
export function resolvePadIndexFromKeyboard(e, keyToPadIndex) {
  // AltGr (p. ej. ES-LATAM) suele enviar ctrlKey + altKey a la vez; no bloquear eso.
  if (e.metaKey || (e.ctrlKey && !e.altKey)) return undefined;

  const code = e.code || '';
  const keyVal = e.key;

  if (code && keyToPadIndex[code] !== undefined) return keyToPadIndex[code];

  if (typeof keyVal === 'string' && keyVal.length === 1) {
    const low = keyVal.toLowerCase();
    if (keyToPadIndex[low] !== undefined) return keyToPadIndex[low];
    const inferredLetter = 'Key' + keyVal.toUpperCase();
    if (/^Key[A-Z]$/.test(inferredLetter) && keyToPadIndex[inferredLetter] !== undefined) {
      return keyToPadIndex[inferredLetter];
    }
  }

  const m = /^Key([A-Z])$/.exec(code);
  if (m) {
    const low = m[1].toLowerCase();
    if (keyToPadIndex[low] !== undefined) return keyToPadIndex[low];
  }

  if (/^[0-9]$/.test(keyVal)) {
    const digitCode = 'Digit' + keyVal;
    if (keyToPadIndex[digitCode] !== undefined) return keyToPadIndex[digitCode];
  }

  return undefined;
}
