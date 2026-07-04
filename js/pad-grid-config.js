/**
 * Pad grid layouts — single source of truth for virtual.js and kit-config-share.js.
 */

/** @typedef {{ rows: number, cols: number, total: number }} PadGridConfig */

/** @type {Record<string, PadGridConfig>} */
export const PAD_GRID_CONFIGS = {
  '3x3': { rows: 3, cols: 3, total: 9 },
  '3x4': { rows: 3, cols: 4, total: 12 },
  '4x4': { rows: 4, cols: 4, total: 16 },
  '4x6': { rows: 4, cols: 6, total: 24 },
};

/** Smallest → largest; used for pad sound/key inheritance. */
export const PAD_GRID_SIZE_ORDER = ['3x3', '3x4', '4x4', '4x6'];
