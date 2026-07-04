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
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const std = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** @param {ReturnType<typeof collectKitSnapshot>} snapshot */
export function encodeKitSnapshot(snapshot) {
  const json = JSON.stringify(snapshot);
  return KIT_CONFIG_PREFIX + toBase64Url(json);
}

/** Extract kit token from pasted text, URL, or raw BC1 string. */
export function extractKitToken(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '';

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const fromQuery = url.searchParams.get('kit');
      if (fromQuery) return fromQuery.trim();
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const fromHash = hashParams.get('kit');
      if (fromHash) return fromHash.trim();
    }
  } catch { /* not a URL */ }

  const bcMatch = trimmed.match(/BC1\.[A-Za-z0-9_-]+/);
  if (bcMatch) return bcMatch[0];

  if (trimmed.startsWith(KIT_CONFIG_PREFIX)) return trimmed.split(/\s/)[0];

  return trimmed;
}

/** @returns {ReturnType<typeof collectKitSnapshot>} */
export function decodeKitToken(token) {
  const raw = extractKitToken(token);
  if (!raw.startsWith(KIT_CONFIG_PREFIX)) {
    throw new Error('Código inválido: debe empezar con BC1.');
  }
  const b64 = raw.slice(KIT_CONFIG_PREFIX.length);
  let parsed;
  try {
    parsed = JSON.parse(fromBase64Url(b64));
  } catch {
    throw new Error('No se pudo leer el código. Está incompleto o corrupto.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Formato de kit no reconocido.');
  if (parsed.v !== KIT_CONFIG_VERSION) throw new Error('Versión de kit no compatible.');
  return parsed;
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

/** @param {ReturnType<typeof collectKitSnapshot>} snapshot @param {string} code @param {string} [baseHref] */
export function buildShareMessage(snapshot, code, baseHref) {
  const name = snapshot.n || 'Batería champetera';
  const link = buildKitShareUrl(code, baseHref);
  return (
    `🥁 *Kit Batería Champetera* — ${name}\n\n` +
    `Abrí este enlace para cargarlo:\n${link}\n\n` +
    `O en bateriachampetera.com → *Exportar* → pegá este código:\n${code}`
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
  if (fromQuery) return fromQuery.trim();
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  return hashParams.get('kit')?.trim() || '';
}
