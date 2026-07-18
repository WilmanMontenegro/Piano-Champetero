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

/** @param {string} [displayName] */
export function collectKitSnapshot(displayName = '') {
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

  return {
    v: KIT_CONFIG_VERSION,
    n: displayName.trim().slice(0, 40) || undefined,
    s: readJson(STORAGE.samplers),
    k: readJson(STORAGE.keyMap),
    p: Object.keys(pads).length ? pads : undefined,
    pk: Object.keys(padKeys).length ? padKeys : undefined,
    vm: readString(STORAGE.viewMode) || undefined,
    gt: readString(STORAGE.gridType) || undefined,
    vol: Number.isFinite(volume) ? volume : undefined,
    nr: readString(STORAGE.noteRepeat) === '1' ? true : readString(STORAGE.noteRepeat) === '0' ? false : undefined,
  };
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url) {
  let s = compactBase64Url(b64url).replace(/-/g, '+').replace(/_/g, '/');
  // Tolerate standard base64 if someone re-encoded
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  s += pad;
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** @param {ReturnType<typeof collectKitSnapshot>} snapshot */
export function encodeKitSnapshot(snapshot) {
  const json = JSON.stringify(snapshot);
  return KIT_CONFIG_PREFIX + toBase64Url(json);
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

function parseKitJson(b64) {
  const parsed = JSON.parse(fromBase64Url(b64));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Formato de kit no reconocido.');
  }
  if (parsed.v !== KIT_CONFIG_VERSION) {
    throw new Error('Versión de kit no compatible.');
  }
  return parsed;
}

/**
 * Decode BC1 payload; trim trailing junk glued by chats (e.g. "salu2" after the code).
 * ponytail: O(n) suffix trim — ceiling ~400 chops; upgrade = checksum in BC2.
 */
function parseKitJsonTolerant(b64) {
  let s = compactBase64Url(b64);
  const maxChops = 400;
  for (let chop = 0; chop <= maxChops && s.length >= 8; chop += 1) {
    try {
      return parseKitJson(s);
    } catch (err) {
      if (err instanceof Error && /Versión|Formato/.test(err.message)) throw err;
      s = s.slice(0, -1);
    }
  }
  throw new Error('corrupt');
}

/** @returns {ReturnType<typeof collectKitSnapshot>} */
export function decodeKitToken(token) {
  const candidates = extractKitTokenCandidates(token);
  if (!candidates.length) {
    throw new Error('Código inválido: debe empezar con BC1. o ser un enlace con ?kit=');
  }

  let sawCorrupt = false;
  for (const raw of candidates) {
    try {
      return parseKitJsonTolerant(raw.slice(KIT_CONFIG_PREFIX.length));
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

/**
 * Prefer the raw BC1 code in WhatsApp — long ?kit= URLs get truncated by the app.
 * @param {ReturnType<typeof collectKitSnapshot>} snapshot
 * @param {string} code
 * @param {string} [baseHref]
 */
export function buildShareMessage(snapshot, code, baseHref) {
  const name = snapshot.n || 'Batería champetera';
  const link = buildKitShareUrl(code, baseHref);
  // Short kits: link is fine. Long kits: code-first so paste/import still works if URL truncates.
  const preferCode = code.length > 1200;
  if (preferCode) {
    return (
      `🥁 *Kit Batería Champetera* — ${name}\n\n` +
      `En bateriachampetera.com → *Exportar* → pegá este código completo:\n\n` +
      `${code}\n\n` +
      `(Si el enlace no abre, usá el código de arriba.)\n${link}`
    );
  }
  return (
    `🥁 *Kit Batería Champetera* — ${name}\n\n` +
    `Abrí este enlace para cargarlo:\n${link}\n\n` +
    `O pegá este código en Exportar → Importar:\n${code}`
  );
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

// ponytail: smoke — WhatsApp line-wrap + trailing chat junk must still decode
{
  const snap = { v: 1, n: 'test', vm: 'pads' };
  const code = encodeKitSnapshot(snap);
  const wrapped = `${code.slice(0, 40)}\n${code.slice(40)}\u200B`;
  const withJunk = `Mira hermano\n${wrapped}\nsalu2`;
  console.assert(decodeKitToken(withJunk).n === 'test', 'kit decode survives WhatsApp wrap+junk');
  console.assert(extractKitToken(wrapped).startsWith('BC1.'), 'kit extract joins wrapped BC1');
}
