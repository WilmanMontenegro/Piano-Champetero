/**
 * Export / import kit config — share via WhatsApp or paste BC1.* code.
 * Code in English; UI strings live in virtual.html / virtual.js.
 */

import { PAD_GRID_SIZE_ORDER } from './pad-grid-config.js';

export const KIT_CONFIG_PREFIX = 'BC1.';
export const KIT_CONFIG_VERSION = 1;

const STORAGE = {
  samplers: 'pianoChampeteroSamplers',
  keyMap: 'pianoChampeteroKeyMap',
  viewMode: 'pianoChampeteroViewMode',
  gridType: 'pianoChampeteroGridType',
  volume: 'pianoChampeteroVolume',
  noteRepeat: 'pianoChampeteroNoteRepeat',
  pads: (grid) => `pianoChampeteroPads_${grid}`,
  padKeys: (grid) => `pianoChampeteroPadKeys_${grid}`,
};

/** WhatsApp / messengers insert ZWSP, soft hyphens, and line breaks in long codes. */
function stripInvisible(text) {
  return String(text || '').replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u180E]/g, '');
}

function compactBase64Url(text) {
  return stripInvisible(text).replace(/\s+/g, '');
}

/** Normalize a BC1.* token (no spaces / invisible junk). */
export function normalizeKitToken(token) {
  const compact = compactBase64Url(token);
  if (!compact) return '';
  const m = compact.match(/BC1\.[A-Za-z0-9_-]+/);
  return m ? m[0] : compact.startsWith(KIT_CONFIG_PREFIX) ? compact : '';
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readString(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * @param {string} [displayName]
 * @param {{ compact?: boolean, gridType?: string }} [opts]
 * compact=true → only active grid (shorter WhatsApp/?kit= links)
 */
export function collectKitSnapshot(displayName = '', opts = {}) {
  const { compact = false, gridType: gridOpt = null } = opts;
  const pads = {};
  const padKeys = {};
  for (const grid of PAD_GRID_SIZE_ORDER) {
    const sounds = readJson(STORAGE.pads(grid));
    if (sounds) pads[grid] = sounds;
    const keys = readJson(STORAGE.padKeys(grid));
    if (keys) padKeys[grid] = keys;
  }

  const volumeRaw = readString(STORAGE.volume);
  const volume = volumeRaw != null ? parseFloat(volumeRaw) : null;
  const storedGt = readString(STORAGE.gridType);
  const gt =
    (gridOpt && PAD_GRID_SIZE_ORDER.includes(gridOpt) && gridOpt)
    || (storedGt && PAD_GRID_SIZE_ORDER.includes(storedGt) && storedGt)
    || '3x4';

  /** @type {Record<string, unknown>} */
  const snap = {
    v: KIT_CONFIG_VERSION,
    n: displayName.trim().slice(0, 32) || undefined,
    s: readJson(STORAGE.samplers),
    k: readJson(STORAGE.keyMap),
    p: Object.keys(pads).length ? pads : undefined,
    pk: Object.keys(padKeys).length ? padKeys : undefined,
    vm: readString(STORAGE.viewMode) || undefined,
    gt: storedGt || undefined,
    vol: Number.isFinite(volume) ? volume : undefined,
    nr: readString(STORAGE.noteRepeat) === '1' ? true : readString(STORAGE.noteRepeat) === '0' ? false : undefined,
  };

  if (!compact) return snap;

  // Share payload: one grid only — keeps ?kit= under WhatsApp URL limits
  return {
    v: snap.v,
    n: snap.n,
    s: snap.s,
    k: snap.k,
    p: pads[gt] ? { [gt]: pads[gt] } : undefined,
    pk: padKeys[gt] ? { [gt]: padKeys[gt] } : undefined,
    vm: snap.vm || 'pads',
    gt,
    vol: snap.vol,
    nr: snap.nr,
  };
}

function bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url) {
  let s = compactBase64Url(b64url).replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  s += pad;
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Deflate-raw — keeps ?kit= under WhatsApp URL limits with real sampler paths. */
async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {ReturnType<typeof collectKitSnapshot>} snapshot */
export async function encodeKitSnapshot(snapshot) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(snapshot));
  // Compressed body — old readers fail; decodeKitToken inflates when JSON parse fails
  const compressed = await deflateRaw(jsonBytes);
  return KIT_CONFIG_PREFIX + bytesToBase64Url(compressed);
}

/**
 * Collect possible kit tokens from paste (URL kit=, BC1 broken across lines, etc.).
 * Longest BC1 first — truncated WhatsApp links often lose out to a full pasted code.
 */
export function extractKitTokenCandidates(input) {
  const text = stripInvisible(String(input || '')).trim();
  if (!text) return [];

  /** @type {string[]} */
  const out = [];
  const push = (raw) => {
    const n = normalizeKitToken(raw);
    if (n.startsWith(KIT_CONFIG_PREFIX) && !out.includes(n)) out.push(n);
  };

  const urlMatches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  for (const rawUrl of urlMatches) {
    try {
      const cleaned = rawUrl.replace(/[),.;!?]+$/g, '');
      const url = new URL(cleaned);
      const fromQuery = url.searchParams.get('kit');
      if (fromQuery) push(fromQuery);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const fromHash = hashParams.get('kit');
      if (fromHash) push(fromHash);
    } catch { /* not a URL */ }
  }

  // Each BC1. … run: keep base64url chars, skip spaces/newlines inside (WhatsApp wrap)
  let idx = 0;
  while ((idx = text.indexOf(KIT_CONFIG_PREFIX, idx)) !== -1) {
    let i = idx + KIT_CONFIG_PREFIX.length;
    let body = '';
    while (i < text.length) {
      const ch = text[i];
      if (/[A-Za-z0-9_-]/.test(ch)) {
        body += ch;
        i += 1;
      } else if (/\s/.test(ch)) {
        i += 1; // line wrap — do not stop
      } else {
        break; // punctuation / emoji / other
      }
    }
    push(KIT_CONFIG_PREFIX + body);
    idx = i;
  }

  // Prefer longer tokens (more complete) when trying decode
  out.sort((a, b) => b.length - a.length);
  return out;
}

/** Extract kit token from pasted text, URL, or raw BC1 string. */
export function extractKitToken(input) {
  const candidates = extractKitTokenCandidates(input);
  return candidates[0] || '';
}

function validateKitObject(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Formato de kit no reconocido.');
  }
  if (parsed.v !== KIT_CONFIG_VERSION) {
    throw new Error('Versión de kit no compatible.');
  }
  return parsed;
}

/** Legacy uncompressed JSON, or deflate-raw (current). */
async function parseKitPayloadBytes(bytes) {
  // Uncompressed JSON starts with '{'
  if (bytes.length && bytes[0] === 0x7b) {
    return validateKitObject(JSON.parse(new TextDecoder().decode(bytes)));
  }
  const inflated = await inflateRaw(bytes);
  return validateKitObject(JSON.parse(new TextDecoder().decode(inflated)));
}

/**
 * Decode BC1 payload; trim trailing junk glued by chats (e.g. "salu2" after the code).
 * ponytail: O(n) suffix trim — ceiling ~400 chops; upgrade = checksum in BC2.
 */
async function parseKitJsonTolerant(b64) {
  let s = compactBase64Url(b64);
  const maxChops = 400;
  for (let chop = 0; chop <= maxChops && s.length >= 8; chop += 1) {
    try {
      return await parseKitPayloadBytes(base64UrlToBytes(s));
    } catch (err) {
      if (err instanceof Error && /Versión|Formato/.test(err.message)) throw err;
      s = s.slice(0, -1);
    }
  }
  throw new Error('corrupt');
}

/** @returns {Promise<ReturnType<typeof collectKitSnapshot>>} */
export async function decodeKitToken(token) {
  const candidates = extractKitTokenCandidates(token);
  if (!candidates.length) {
    throw new Error('Código inválido: debe empezar con BC1. o ser un enlace con ?kit=');
  }

  let sawCorrupt = false;
  for (const raw of candidates) {
    try {
      return await parseKitJsonTolerant(raw.slice(KIT_CONFIG_PREFIX.length));
    } catch (err) {
      if (err instanceof Error && /Versión|Formato/.test(err.message)) throw err;
      sawCorrupt = true;
    }
  }

  if (sawCorrupt) {
    throw new Error(
      'No se pudo leer el código. Suele pasar si WhatsApp lo cortó o partió en varias líneas. Pedí el código BC1 completo (botón Copiar) y pegalo entero.'
    );
  }
  throw new Error('Código inválido: debe empezar con BC1.');
}

/** @param {string} code @param {string} [baseHref] */
export function buildKitShareUrl(code, baseHref) {
  const base = baseHref || (typeof location !== 'undefined'
    ? `${location.origin}${location.pathname}`
    : 'https://bateriachampetera.com/virtual.html');
  const url = new URL(base);
  url.searchParams.set('kit', code);
  return url.href;
}

/** @param {string} message */
export function buildWhatsAppSendUrl(message) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** WhatsApp / iMessage often truncate links past ~2k chars. */
export const KIT_SHARE_SAFE_URL_LEN = 1800;

/**
 * WhatsApp share: short intro + link (one tap imports). Code only if link too long.
 * @param {ReturnType<typeof collectKitSnapshot>} _snapshot
 * @param {string} code
 * @param {string} [baseHref]
 */
export function buildShareMessage(_snapshot, code, baseHref) {
  const intro = 'Mira, te comparto la configuración de mi batería.';
  const link = buildKitShareUrl(code, baseHref);

  if (link.length <= KIT_SHARE_SAFE_URL_LEN) {
    return `${intro}\n${link}`;
  }

  // Rare: still too long after compress → code for Imp/Exp → Importar
  return `${intro}\n${code}`;
}

/** Write snapshot fields to localStorage (caller refreshes runtime state). */
export function persistKitSnapshot(snapshot) {
  if (snapshot.s && typeof snapshot.s === 'object') {
    localStorage.setItem(STORAGE.samplers, JSON.stringify(snapshot.s));
  }
  if (snapshot.k && typeof snapshot.k === 'object') {
    localStorage.setItem(STORAGE.keyMap, JSON.stringify(snapshot.k));
  }
  if (snapshot.p && typeof snapshot.p === 'object') {
    for (const grid of PAD_GRID_SIZE_ORDER) {
      if (Array.isArray(snapshot.p[grid])) {
        localStorage.setItem(STORAGE.pads(grid), JSON.stringify(snapshot.p[grid]));
      }
    }
  }
  if (snapshot.pk && typeof snapshot.pk === 'object') {
    for (const grid of PAD_GRID_SIZE_ORDER) {
      if (snapshot.pk[grid] && typeof snapshot.pk[grid] === 'object') {
        localStorage.setItem(STORAGE.padKeys(grid), JSON.stringify(snapshot.pk[grid]));
      }
    }
  }
  if (snapshot.vm === 'bateria' || snapshot.vm === 'pads') {
    localStorage.setItem(STORAGE.viewMode, snapshot.vm);
  }
  if (snapshot.gt && PAD_GRID_SIZE_ORDER.includes(snapshot.gt)) {
    localStorage.setItem(STORAGE.gridType, snapshot.gt);
  }
  if (typeof snapshot.vol === 'number' && Number.isFinite(snapshot.vol)) {
    localStorage.setItem(STORAGE.volume, String(Math.min(1, Math.max(0, snapshot.vol))));
  }
  if (typeof snapshot.nr === 'boolean') {
    localStorage.setItem(STORAGE.noteRepeat, snapshot.nr ? '1' : '0');
  }
}

/** @param {string} [search] @param {string} [hash] */
export function kitTokenFromPageUrl(search = location.search, hash = location.hash) {
  const params = new URLSearchParams(search);
  const fromQuery = params.get('kit');
  if (fromQuery) return normalizeKitToken(fromQuery) || fromQuery.trim();
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  const fromHash = hashParams.get('kit');
  return fromHash ? (normalizeKitToken(fromHash) || fromHash.trim()) : '';
}

/**
 * Copy text — sync execCommand first (keeps click gesture; Safari/iOS friendly),
 * then Clipboard API, then offscreen textarea.
 * @param {string} text
 * @param {HTMLTextAreaElement | HTMLInputElement | null} [field]
 * @returns {Promise<boolean>}
 */
export async function copyTextToClipboard(text, field = null) {
  const value = String(text || '');
  if (!value) return false;

  // 1) Visible field + execCommand in the same turn as the click
  if (field && typeof field.select === 'function') {
    try {
      const wasReadonly = field.hasAttribute('readonly');
      if (wasReadonly) field.removeAttribute('readonly');
      field.focus({ preventScroll: true });
      field.value = value;
      field.select();
      field.setSelectionRange(0, value.length);
      const ok = document.execCommand('copy');
      if (wasReadonly) field.setAttribute('readonly', '');
      if (ok) return true;
    } catch { /* continue */ }
  }

  // 2) Async Clipboard API
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch { /* continue */ }
  }

  // 3) Offscreen textarea
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}

// ponytail: smoke — compressed encode + WhatsApp wrap/junk still decode
(async () => {
  if (typeof CompressionStream === 'undefined') return;
  const snap = { v: 1, n: 'test', vm: 'pads' };
  const code = await encodeKitSnapshot(snap);
  const wrapped = `${code.slice(0, 40)}\n${code.slice(40)}\u200B`;
  const withJunk = `Mira hermano\n${wrapped}\nsalu2`;
  console.assert((await decodeKitToken(withJunk)).n === 'test', 'kit decode survives WhatsApp wrap+junk');
  console.assert(extractKitToken(wrapped).startsWith('BC1.'), 'kit extract joins wrapped BC1');
  const wa = buildShareMessage(snap, code, 'https://bateriachampetera.com/virtual.html');
  const waLines = wa.trim().split('\n');
  console.assert(waLines.length === 2, 'WA message is intro + one payload');
  console.assert(waLines[0].includes('configuración de mi batería'), 'WA intro is brief share line');
  console.assert(waLines[1].startsWith('http') || waLines[1].startsWith('BC1.'), 'WA payload is link XOR code');
})().catch((err) => console.warn('kit-config-share smoke failed', err));
