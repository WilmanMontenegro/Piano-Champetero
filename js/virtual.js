// js/virtual.js — lógica de la batería para virtual.html
// OPTIMIZADO: Latencia mínima, preload agresivo, sin requestAnimationFrame en play
import { initSiteChrome, setYearFooter, resumeOnUserGesture } from './common.js';
import { AUDIO_UI } from './site-config.js';
import { initModal } from './modal-utils.js';
import { DEFAULT_PAD_KEY_CHAR_ORDER, BATTERY_DEFAULT_PAD_CHARS, buildPadKeyIndexMap, resolvePadIndexFromKeyboard } from './pad-keyboard.js';
import { initAudioBus, connectHitToOutput } from './audio-bus.js';
import { initAudioVisualizer, pulseAudioVisualizer } from './audio-visualizer.js';
import { resolveSamplerPath, samplerUrl, samplerBasename } from './sampler-path.js';
import { mountSamplerBrowser, loadSamplerCatalog } from './sampler-browser.js';
import { isNoteRepeatEnabled, startNoteRepeat, stopNoteRepeat, stopAllNoteRepeat } from './note-repeat.js';
import { stopSamplerPreview, previewSamplerPath } from './sampler-preview.js';

// AudioContext con latencia mínima
export const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
  latencyHint: 'interactive',
  sampleRate: 48000
});

const { analyser } = initAudioBus(audioCtx);

const HIT_FLASH_MS = AUDIO_UI.hitFlashMs;
const RETRIGGER_MASK_SEC = (AUDIO_UI.retriggerMaskMs ?? 45) / 1000;

/** @type {Map<string, number>} voiceKey → audioContext.currentTime */
const lastTriggerAt = new Map();
/** @type {Map<string, { source: AudioBufferSourceNode, gain: GainNode }>} */
const activeVoices = new Map();
/** Keyboard codes currently held (our note repeat, not OS repeat). */
const keysHeldForRepeat = new Set();

function tomVoiceKey(tomId) {
  return `tom:${tomId}`;
}

function padVoiceKey(index) {
  return `pad:${index}`;
}

export const tomSamplersDefaults = {
  'tom-1': 'FABIAN LOOP EFECT/D (2).wav',
  'tom-2': 'piano creciente/F4.wav',
  'tom-3': 'SK5/Pitico.wav',
  'tom-4': 'SK5/SKTAC.WAV',
  'tom-5': 'piano creciente/Y.wav',
  'tom-6': 'SK5/Lazer.wav',
  'tom-7': 'SK5/perro bajo.WAV',
  'tom-8': 'SK5/SK2.WAV',
  'tom-9': 'FREDDY X LS Samples/Smar 1.wav'
};

/** Site-original samples (not in gallery folders); synced from Originales web/. */
export const samplerList = [
  'Originales web/00COMO DD14.wav', 'Originales web/00ctm6.wav', 'Originales web/00DEEJAY.mp3', 'Originales web/00EFECTO SANTOYA-TRA.wav',
  'Originales web/00EXELENT.wav', 'Originales web/00FOUR-1.wav', 'Originales web/00piii Samples.wav', 'Originales web/00Yeut01 Sk.wav',
  'Originales web/11-BALETA (1).wav', 'Originales web/142.wav', 'Originales web/159.wav', 'Originales web/16.wav',
  'Originales web/17.wav', 'Originales web/18.wav', 'Originales web/20.wav', 'Originales web/20_2.wav',
  'Originales web/217.wav', 'Originales web/555.wav', 'Originales web/63_SNARE.wav', 'Originales web/BAJO CHAMPETA.wav',
  'Originales web/Bateria 4.wav', 'Originales web/Bateria 8.wav', 'Originales web/C_Kick.wav', 'Originales web/canario.wav',
  'Originales web/CAS.wav', 'Originales web/CM perreo 4x4 (11).wav', 'Originales web/CM perreo 4x4 (12).wav', 'Originales web/DD50 SANRE.wav',
  'Originales web/DD50 SNARE5.wav', 'Originales web/EEEE.wav', 'Originales web/Effect 16.wav', 'Originales web/Effect 2.wav',
  'Originales web/Effect 9.wav', 'Originales web/GAVIOTA dd14.wav', 'Originales web/HEY VACANO.wav', 'Originales web/laser profeta 2.wav',
  'Originales web/OU3.wav', 'Originales web/pimpollo CENCERRO.wav', 'Originales web/PITICO CARNAVAL.wav', 'Originales web/PITICO CARNAVAL2.wav',
  'Originales web/PITICO CARNAVAL3.wav', 'Originales web/PITO3-D.wav', 'Originales web/PITO4-.wav', 'Originales web/Platillo.wav',
  'Originales web/Ponte Ready.wav', 'Originales web/PS 555 ORIGINAL.wav', 'Originales web/Rudeboy_AyAy.wav', 'Originales web/Sampler Yeah.mp3',
  'Originales web/sk5 -dog 1.wav', 'Originales web/sk5 -dog 17.wav', 'Originales web/SN DD14.wav', 'Originales web/snare (100).wav',
  'Originales web/SNARE 7.wav', 'Originales web/SNARE8.wav', 'Originales web/T10  Samples.wav', 'Originales web/T9  Samples.wav',
  'Originales web/TAMOS fUECTE COMO RAMBO .wav', 'Originales web/TE LO REPITO.mp3', 'Originales web/Todo el mundo espelucao.wav', 'Originales web/Treyban1.wav',
  'Originales web/TUS.wav', 'Originales web/VACILE RAPIDO (3).wav', 'Originales web/Vesatile_Sound_Phrase_PL.wav', 'Originales web/VIIP.wav',
  'Originales web/Wuaaa.wav'
];

export const tomAudioMap = (function init() {
  const map = { ...tomSamplersDefaults };
  const dataSamplers = localStorage.getItem('pianoChampeteroSamplers');
  if (dataSamplers) {
    try {
      const parsed = JSON.parse(dataSamplers);
      Object.keys(map).forEach(k => { if (parsed[k]) map[k] = parsed[k]; });
    } catch (e) { /* ignore */ }
  }
  return map;
})();

export const keyToTomIdDefaults = Object.fromEntries(
  BATTERY_DEFAULT_PAD_CHARS.map((ch, i) => [ch, `tom-${i + 1}`])
);

export const tomSamplerBuffers = {};
const VOLUME_STORAGE_KEY = 'pianoChampeteroVolume';
const DEFAULT_VOLUME = 0.5;

function readStoredVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw == null) return DEFAULT_VOLUME;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

function saveStoredVolume(v) {
  try { localStorage.setItem(VOLUME_STORAGE_KEY, String(v)); } catch { /* ignore */ }
}

export let currentVolume = readStoredVolume();
export let samplersDisponibles = [];

let keyToTomId = {};
let _currentVolume = currentVolume;

// View mode and grid configuration
export const gridConfigs = {
  '3x3': { rows: 3, cols: 3, total: 9 },
  '3x4': { rows: 3, cols: 4, total: 12 },
  '4x4': { rows: 4, cols: 4, total: 16 },
  '4x6': { rows: 4, cols: 6, total: 24 }
};

const PAD_GRID_SIZE_ORDER = ['3x3', '3x4', '4x4', '4x6'];

function predecessorGridType(gridType) {
  const i = PAD_GRID_SIZE_ORDER.indexOf(gridType);
  return i > 0 ? PAD_GRID_SIZE_ORDER[i - 1] : null;
}

function getDefaultPadsSounds(total) {
  // Hereda los sonidos configurados en la vista batería
  const bateriaSounds = Object.values(tomAudioMap).filter(Boolean);
  const sounds = [...bateriaSounds];
  // Rellena los restantes con samplers disponibles sin repetir
  const usedFiles = new Set(sounds.map(f => f.toLowerCase()));
  for (let i = 0; sounds.length < total && i < samplerList.length; i++) {
    if (!usedFiles.has(samplerList[i].toLowerCase())) {
      sounds.push(samplerList[i]);
      usedFiles.add(samplerList[i].toLowerCase());
    }
  }
  return sounds.slice(0, total);
}

function loadPadsViewSounds(gridType) {
  const config = gridConfigs[gridType];
  if (!config) return getDefaultPadsSounds(gridConfigs['3x4'].total);
  const defaults = getDefaultPadsSounds(config.total);
  const savedKey = `pianoChampeteroPads_${gridType}`;
  const saved = localStorage.getItem(savedKey);
  let sounds = null;
  if (saved) {
    try { sounds = JSON.parse(saved); } catch (e) { /* ignore */ }
  }
  if (!Array.isArray(sounds)) {
    const pred = predecessorGridType(gridType);
    if (!pred) return [...defaults];
    const predTotal = gridConfigs[pred].total;
    const inherited = loadPadsViewSounds(pred);
    const out = [];
    for (let i = 0; i < config.total; i++) {
      out[i] = i < predTotal ? (inherited[i] || defaults[i]) : defaults[i];
    }
    return out;
  }
  sounds = sounds.slice(0, config.total);
  for (let i = sounds.length; i < config.total; i++) sounds[i] = defaults[i];
  return sounds;
}

function savePadsViewSounds(gridType, sounds) {
  try { localStorage.setItem(`pianoChampeteroPads_${gridType}`, JSON.stringify(sounds)); } catch (e) {}
}

let currentViewMode = localStorage.getItem('pianoChampeteroViewMode') || 'bateria';
let currentGridType = localStorage.getItem('pianoChampeteroGridType') || '3x4';

// Validar que el grid type exista, si no usar default
if (!gridConfigs[currentGridType]) currentGridType = '3x4';

export let padsViewState = loadPadsViewSounds(currentGridType);
export let padsViewBuffers = {};

// Cache global de TODOS los samplers cargados (evita re-fetch)
const globalSamplerCache = {};

/** @type {Map<string, string>} */
let samplerByFullPath = new Map();
/** @type {Map<string, string[]>} */
let samplerByBasename = new Map();

function rebuildSamplerIndexes(paths) {
  samplerByFullPath = new Map();
  samplerByBasename = new Map();
  const addPath = (p) => {
    if (!p) return;
    const norm = p.replace(/\\/g, '/');
    samplerByFullPath.set(norm.toLowerCase(), norm);
    const base = samplerBasename(norm).toLowerCase();
    const list = samplerByBasename.get(base) || [];
    if (!list.some((x) => x.toLowerCase() === norm.toLowerCase())) list.push(norm);
    samplerByBasename.set(base, list);
  };
  paths.forEach(addPath);
  samplerList.forEach(addPath);
}

function resolveStoredSampler(stored) {
  return resolveSamplerPath(stored, samplerByFullPath, samplerByBasename);
}

/** Path listed in catalog / samplerList (exists under samplers/). */
function isKnownSamplerPath(path) {
  if (!path) return false;
  const norm = path.replace(/\\/g, '/').toLowerCase();
  if (samplerByFullPath.has(norm)) return true;
  const flat = samplerBasename(path).toLowerCase();
  return samplerList.some((s) => s.toLowerCase() === norm || samplerBasename(s).toLowerCase() === flat);
}

/** Resolve stored path; flat basename fallback when only root copy exists. */
function normalizeStoredSamplerPath(stored) {
  if (!stored) return stored;
  return stored.replace(/^Legado sitio\//, 'Originales web/').replace(/\\/g, '/');
}

function preferDeployableSampler(stored) {
  if (!stored) return null;
  const normalized = normalizeStoredSamplerPath(stored);
  const resolved = resolveStoredSampler(normalized) || normalized;
  if (isKnownSamplerPath(resolved)) return resolved;
  const flat = samplerBasename(resolved);
  const match = samplerList.find(
    (s) => s.toLowerCase() === flat.toLowerCase() || samplerBasename(s).toLowerCase() === flat.toLowerCase()
  );
  return match || null;
}

function reconcileSamplerAssignments() {
  let changed = false;
  Object.keys(tomAudioMap).forEach((tomId) => {
    const stored = tomAudioMap[tomId];
    const preferred = preferDeployableSampler(stored);
    const next = preferred ?? tomSamplersDefaults[tomId];
    if (next !== stored) {
      tomAudioMap[tomId] = next;
      changed = true;
    }
  });
  const padTotal = gridConfigs[currentGridType]?.total ?? 12;
  const padDefaults = getDefaultPadsSounds(padTotal);
  padsViewState = padsViewState.map((p, i) => {
    if (!p) return p;
    const preferred = preferDeployableSampler(p);
    if (preferred) {
      if (preferred !== p) changed = true;
      return preferred;
    }
    const next = padDefaults[i] || '';
    if (next !== p) changed = true;
    return next;
  });
  if (changed) {
    saveSamplers();
    savePadsViewSounds(currentGridType, padsViewState);
  }
}

/** Audio listo antes del golpe — resume en captura, sin await en el play. */
function initAudioWarmup() {
  const warm = () => {
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  };
  document.addEventListener('pointerdown', warm, { capture: true, passive: true });
  document.addEventListener('keydown', warm, { capture: true, passive: true });
  document.addEventListener('touchstart', warm, { capture: true, passive: true });
  document.addEventListener('user-gesture', warm);
}

function assignedSamplerPaths() {
  const files = new Set(Object.values(tomAudioMap).filter(Boolean));
  padsViewState.forEach((f) => { if (f) files.add(f); });
  return files;
}

async function preloadSamplerFile(fileName) {
  if (!fileName) return null;
  const candidates = [fileName];
  const flat = samplerBasename(fileName);
  if (flat && flat !== fileName) candidates.push(flat);

  for (const path of candidates) {
    const url = samplerUrl(path);
    if (globalSamplerCache[url]) {
      tomSamplerBuffers[fileName] = globalSamplerCache[url];
      return globalSamplerCache[url];
    }
    try {
      const buffer = await loadSamplerBuffer(url);
      tomSamplerBuffers[fileName] = buffer;
      if (path !== fileName) tomSamplerBuffers[path] = buffer;
      return buffer;
    } catch { /* try flat fallback */ }
  }
  tomSamplerBuffers[fileName] = null;
  return null;
}

let keyToPadIndex = Object.create(null);

/** Set from DOMContentLoaded: generatePadsView lives at module scope and cannot see nested functions. */
let openPadEditModalRef = null;

function padKeysStorageKey(gridType) {
  return `pianoChampeteroPadKeys_${gridType}`;
}

function loadPadKeysSavedObject(gridType) {
  try {
    const raw = localStorage.getItem(padKeysStorageKey(gridType));
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function findCanonicalCodeForPad(map, padIndex) {
  const hits = [];
  for (const [k, v] of Object.entries(map)) {
    if (v !== padIndex) continue;
    if (/^Key[A-Z]$/.test(k) || /^Digit[0-9]$/.test(k) || /^Numpad[0-9]$/.test(k)) hits.push(k);
  }
  hits.sort();
  return hits[0] || null;
}

/**
 * One canonical key per pad index; re-adds lowercase letter aliases for Key* codes.
 * @param {Record<string, number>} out
 * @param {number} total
 */
function normalizePlayablePadKeyMap(out, total) {
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v !== 'number' || v < 0 || v >= total) delete out[k];
  }
  for (const k of Object.keys(out)) {
    if (/^[a-z]$/.test(k)) delete out[k];
  }
  for (let p = 0; p < total; p++) {
    const hits = [];
    for (const [k, v] of Object.entries(out)) {
      if (v !== p) continue;
      if (/^Key[A-Z]$/.test(k) || /^Digit[0-9]$/.test(k) || /^Numpad[0-9]$/.test(k)) hits.push(k);
    }
    hits.sort();
    const keep = hits[0];
    for (const h of hits) {
      if (h !== keep) delete out[h];
    }
  }
  const usedKeys = new Set(Object.keys(out));
  for (let p = 0; p < total; p++) {
    if (findCanonicalCodeForPad(out, p)) continue;
    for (const ch of DEFAULT_PAD_KEY_CHAR_ORDER) {
      const code = 'Key' + ch.toUpperCase();
      if (!usedKeys.has(code)) {
        out[code] = p;
        out[ch] = p;
        usedKeys.add(code);
        usedKeys.add(ch);
        break;
      }
    }
  }
  for (const [k, v] of Object.entries({ ...out })) {
    const m = /^Key([A-Z])$/.exec(k);
    if (m) out[m[1].toLowerCase()] = v;
  }
}

function persistPadKeysForCurrentGrid() {
  const total = gridConfigs[currentGridType]?.total || 0;
  normalizePlayablePadKeyMap(keyToPadIndex, total);
  const canon = Object.create(null);
  for (let p = 0; p < total; p++) {
    const c = findCanonicalCodeForPad(keyToPadIndex, p);
    if (c) canon[c] = p;
  }
  try {
    localStorage.setItem(padKeysStorageKey(currentGridType), JSON.stringify(canon));
  } catch {}
}

function buildPadKeyMapFromSaved(total, saved) {
  const base = buildPadKeyIndexMap(total);
  const out = { ...base };
  const entries = Object.entries(saved).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [rawKey, rawVal] of entries) {
    let code = rawKey;
    if (/^[a-z]$/.test(code)) code = 'Key' + code.toUpperCase();
    else if (/^[A-Z]$/.test(code)) code = 'Key' + code;
    else if (/^[0-9]$/.test(code)) code = 'Digit' + code;
    if (!/^Key[A-Z]$/.test(code) && !/^Digit[0-9]$/.test(code) && !/^Numpad[0-9]$/.test(code)) continue;
    const idx = rawVal | 0;
    if (idx < 0 || idx >= total) continue;
    for (const k of Object.keys(out)) {
      if (out[k] === idx) delete out[k];
    }
    delete out[code];
    const mk = /^Key([A-Z])$/.exec(code);
    if (mk) delete out[mk[1].toLowerCase()];
    out[code] = idx;
    if (mk) out[mk[1].toLowerCase()] = idx;
  }
  normalizePlayablePadKeyMap(out, total);
  return out;
}

function computePadKeysForGrid(gridType) {
  const config = gridConfigs[gridType];
  const total = config ? config.total : 0;
  if (!total) return buildPadKeyIndexMap(gridConfigs['3x4'].total);
  const saved = loadPadKeysSavedObject(gridType);
  if (saved && Object.keys(saved).length > 0) {
    return buildPadKeyMapFromSaved(total, saved);
  }
  const pred = predecessorGridType(gridType);
  if (!pred) {
    return buildPadKeyIndexMap(total);
  }
  const predTotal = gridConfigs[pred].total;
  const predMap = computePadKeysForGrid(pred);
  const base = buildPadKeyIndexMap(total);
  const out = { ...base };
  for (let p = 0; p < predTotal; p++) {
    const code = findCanonicalCodeForPad(predMap, p);
    if (!code) continue;
    for (const k of Object.keys(out)) {
      if (out[k] === p) delete out[k];
    }
    delete out[code];
    const mk = /^Key([A-Z])$/.exec(code);
    if (mk) delete out[mk[1].toLowerCase()];
    out[code] = p;
    if (mk) out[mk[1].toLowerCase()] = p;
  }
  normalizePlayablePadKeyMap(out, total);
  return out;
}

function rebuildPadKeyIndexMap() {
  keyToPadIndex = computePadKeysForGrid(currentGridType);
}

export function saveKeyMapping(map) { try { const normalized = normalizeKeyMap(map); localStorage.setItem('pianoChampeteroKeyMap', JSON.stringify(normalized)); } catch (e) {} }
export function loadKeyMapping() {
  const data = localStorage.getItem('pianoChampeteroKeyMap');
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    const normalized = normalizeKeyMap(parsed);
    try {
      if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        localStorage.setItem('pianoChampeteroKeyMap', JSON.stringify(normalized));
      }
    } catch (e) { /* ignore write errors */ }
    return normalized;
  } catch { return null; }
}

function normalizeKeyMap(rawMap) {
  const out = {};
  Object.entries(rawMap || {}).forEach(([k, v]) => {
    if (!k) return;
    let code = null;
    if (/^(Key|Digit|Numpad)[A-Za-z0-9]+$/.test(k)) code = k;
    else if (k.startsWith('c:')) code = k.slice(2);
    else if (k.startsWith('k:')) {
      const ch = k.slice(2);
      if (/^[A-Za-z]$/.test(ch)) code = 'Key' + ch.toUpperCase();
      else if (/^[0-9]$/.test(ch)) code = 'Digit' + ch;
    }     else if (/^[A-Za-z]$/.test(k)) code = 'Key' + k.toUpperCase();
    else if (/^[0-9]$/.test(k)) code = 'Digit' + k;
    else code = k;
    if (code) out[code] = v;
  });
  return out;
}

function prettyLabelFromId(id) {
  if (!id) return '';
  if (id.startsWith('Key')) return id.slice(3).toUpperCase();
  if (id.startsWith('Digit')) return id.slice(5);
  if (id.startsWith('Numpad')) return id.slice(6);
  return id.toUpperCase();
}

function padKeyDisplayLabel(padIndex, total) {
  if (padIndex < 0 || padIndex >= total) return '';
  const code = findCanonicalCodeForPad(keyToPadIndex, padIndex);
  if (code) return prettyLabelFromId(code);
  const ch = DEFAULT_PAD_KEY_CHAR_ORDER[padIndex];
  return ch ? ch.toUpperCase() : '';
}

export function prettyName(fileName) {
  if (!fileName) return '';
  let name = fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  // Strip leading zeros/digits only if followed by text (e.g. "00COMO DD14" -> "COMO DD14")
  // Keep pure numbers like "142" intact
  name = name.replace(/^[\d\s]+(?=[^\d\s])/, '');
  return name.trim();
}

export function saveSamplers() {
  const payload = {};
  Object.keys(tomAudioMap).forEach(k => {
    payload[k] = tomAudioMap[k] ? tomAudioMap[k].replace(/\\/g, '/') : '';
  });
  try { localStorage.setItem('pianoChampeteroSamplers', JSON.stringify(payload)); } catch {}
}

export function resetSettings() {
  localStorage.removeItem('pianoChampeteroSamplers');
  localStorage.removeItem('pianoChampeteroKeyMap');
  Object.keys(gridConfigs).forEach(g => {
    try { localStorage.removeItem(padKeysStorageKey(g)); } catch {}
    try { localStorage.removeItem(`pianoChampeteroPads_${g}`); } catch {}
  });
  Object.keys(tomAudioMap).forEach(k => tomAudioMap[k] = tomSamplersDefaults[k]);
  rebuildPadKeyIndexMap();
  padsViewState = loadPadsViewSounds(currentGridType);
}

export async function loadAvailableSamplers() {
  rebuildSamplerIndexes([...samplerList]);

  const cat = await loadSamplerCatalog().catch(() => null);
  if (cat?.files?.length) {
    rebuildSamplerIndexes([...samplerList, ...cat.files.map((f) => f.path)]);
    samplersDisponibles = [...new Set([...samplerList, ...cat.files.map((f) => f.path)])];
  } else {
    samplersDisponibles = [...samplerList];
  }

  reconcileSamplerAssignments();
}

// Carga un sampler con cache global (evita re-fetch)
export async function loadSamplerBuffer(url) {
  if (globalSamplerCache[url]) return globalSamplerCache[url];
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sampler HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = await audioCtx.decodeAudioData(arrayBuffer);
  globalSamplerCache[url] = buffer;
  return buffer;
}

// Preload: solo sonidos asignados (batería + pads actuales). Catálogo = bajo demanda en Editar.
export async function preloadAllSamplers() {
  await loadAvailableSamplers();
  await Promise.all([...assignedSamplerPaths()].map((fileName) => preloadSamplerFile(fileName)));
}

async function preloadSamplerByName(fileName) {
  return preloadSamplerFile(fileName);
}

function playSamplerVoice(buffer, voiceKey) {
  const now = audioCtx.currentTime;
  const last = lastTriggerAt.get(voiceKey) ?? 0;
  if (now - last < RETRIGGER_MASK_SEC) return;

  const prev = activeVoices.get(voiceKey);
  if (prev) {
    try { prev.source.stop(); } catch { /* already stopped */ }
    activeVoices.delete(voiceKey);
  }

  lastTriggerAt.set(voiceKey, now);

  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = _currentVolume;
  source.buffer = buffer;
  source.connect(gainNode);
  connectHitToOutput(gainNode);

  const voice = { source, gain: gainNode };
  activeVoices.set(voiceKey, voice);
  source.onended = () => {
    if (activeVoices.get(voiceKey) === voice) activeVoices.delete(voiceKey);
  };

  source.start(0);
  pulseAudioVisualizer();
}

// PLAY: buffer ya en RAM, start(0), sin await
export function playTomSampler(tomId) {
  const fileName = tomAudioMap[tomId];
  if (!fileName) return;
  const url = samplerUrl(fileName);
  const buffer = tomSamplerBuffers[fileName] || globalSamplerCache[url];
  if (!buffer) {
    void preloadSamplerFile(fileName);
    return;
  }
  playSamplerVoice(buffer, `tom:${tomId}`);
}

function flashTomButton(tomId) {
  const button = document.getElementById(tomId);
  if (!button) return;
  button.classList.add('active');
  setTimeout(() => button.classList.remove('active'), HIT_FLASH_MS);
}

export function activateTomSampler(tomId, { flash = true } = {}) {
  if (flash) flashTomButton(tomId);
  if (audioCtx.state === 'running') {
    playTomSampler(tomId);
    return;
  }
  void audioCtx.resume().then(() => playTomSampler(tomId));
}

function beginTomNoteRepeat(tomId) {
  if (!isNoteRepeatEnabled()) return;
  const key = tomVoiceKey(tomId);
  startNoteRepeat(key, () => playTomSampler(tomId));
}

function endTomNoteRepeat(tomId) {
  stopNoteRepeat(tomVoiceKey(tomId));
}

// Pads view functions
function generateGridOptions() {
  const container = document.getElementById('grid-options');
  if (!container) return;
  container.innerHTML = '';
  Object.entries(gridConfigs).forEach(([key, config]) => {
    const btn = document.createElement('button');
    btn.className = 'grid-opt' + (key === currentGridType ? ' active' : '');
    btn.dataset.grid = key;
    btn.title = config.total + ' pads';
    btn.textContent = config.total;
    btn.addEventListener('click', () => changeGrid(key));
    container.appendChild(btn);
  });
}

export function switchView(view) {
  currentViewMode = view;
  localStorage.setItem('pianoChampeteroViewMode', view);

  const batteryView = document.getElementById('battery-view');
  const padsView = document.getElementById('pads-view');
  const gridSelector = document.getElementById('grid-selector');
  const viewBateriaBtn = document.getElementById('view-bateria');
  const viewPadsBtn = document.getElementById('view-pads');

  if (view === 'pads') {
    batteryView.classList.add('hidden');
    padsView.classList.remove('hidden');
    gridSelector.style.display = 'flex';
    viewBateriaBtn.classList.remove('active');
    viewPadsBtn.classList.add('active');
    generateGridOptions();
    generatePadsView();
  } else {
    batteryView.classList.remove('hidden');
    padsView.classList.add('hidden');
    gridSelector.style.display = 'none';
    viewBateriaBtn.classList.add('active');
    viewPadsBtn.classList.remove('active');
  }
}

export function changeGrid(gridType) {
  currentGridType = gridType;
  localStorage.setItem('pianoChampeteroGridType', gridType);
  padsViewState = loadPadsViewSounds(gridType);
  generateGridOptions();
  const padsGrid = document.getElementById('pads-grid');
  padsGrid.className = 'pads-grid grid-' + gridType;
  generatePadsView();
}

export async function preloadPadsViewBuffer(index) {
  const fileName = padsViewState[index];
  if (!fileName) return null;
  return await preloadSamplerByName(fileName);
}

export function playPadSound(index) {
  const fileName = padsViewState[index];
  const url = fileName ? samplerUrl(fileName) : '';
  const buffer = padsViewBuffers[index] || (url ? globalSamplerCache[url] : null);
  if (!buffer) {
    if (fileName) void preloadPadsViewBuffer(index).then((buf) => { if (buf) padsViewBuffers[index] = buf; });
    return;
  }
  playSamplerVoice(buffer, `pad:${index}`);
}

function flashPadButton(index) {
  const padsGrid = document.getElementById('pads-grid');
  const padButton = padsGrid?.children[index];
  if (!padButton) return;
  padButton.classList.add('active');
  setTimeout(() => padButton.classList.remove('active'), HIT_FLASH_MS);
}

export function activatePadSound(index, { flash = true } = {}) {
  if (flash) flashPadButton(index);
  if (audioCtx.state === 'running') {
    playPadSound(index);
    return;
  }
  void audioCtx.resume().then(() => playPadSound(index));
}

function beginPadNoteRepeat(index) {
  if (!isNoteRepeatEnabled()) return;
  const key = padVoiceKey(index);
  startNoteRepeat(key, () => playPadSound(index));
}

function endPadNoteRepeat(index) {
  stopNoteRepeat(padVoiceKey(index));
}

export function generatePadsView() {
  const padsGrid = document.getElementById('pads-grid');
  if (!padsGrid) return;

  const config = gridConfigs[currentGridType];
  rebuildPadKeyIndexMap();
  padsGrid.innerHTML = '';
  padsGrid.className = 'pads-grid grid-' + currentGridType;

  for (let i = 0; i < config.total; i++) {
    const pad = document.createElement('button');
    pad.className = 'pad-item';
    pad.dataset.padIndex = String(i);

    const keyLabel = document.createElement('span');
    keyLabel.className = 'pad-key';
    keyLabel.textContent = padKeyDisplayLabel(i, config.total);

    const soundLabel = document.createElement('span');
    soundLabel.className = 'pad-sound';
    soundLabel.textContent = prettyName(padsViewState[i]) || '';

    pad.appendChild(keyLabel);
    pad.appendChild(soundLabel);
    padsGrid.appendChild(pad);

    pad.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (modoEdicion) {
        e.preventDefault();
        if (openPadEditModalRef) openPadEditModalRef(i);
        return;
      }
      activatePadSound(i);
      beginPadNoteRepeat(i);
      try { pad.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    pad.addEventListener('pointerup', () => endPadNoteRepeat(i));
    pad.addEventListener('pointercancel', () => endPadNoteRepeat(i));
  }

  // Preload buffers en paralelo para pads view
  Object.keys(padsViewBuffers).forEach(k => delete padsViewBuffers[k]);
  if (config.total > 0) {
    Promise.all(Array.from({length: config.total}, (_, i) =>
      preloadPadsViewBuffer(i).then(buf => { if (buf) padsViewBuffers[i] = buf; })
    ));
  }
}

let modoEdicion = false;
let tomSeleccionado = null;
let samplerSeleccionado = null;
let activeTab = 'sampler';
let lastCapturedCode = null;
let padSeleccionado = null;
let padSamplerSeleccionado = null;

function actualizarNombresPads() {
  const tomToKeys = {};
  Object.entries(keyToTomId).forEach(([key, tomId]) => { tomToKeys[tomId] = tomToKeys[tomId] || []; tomToKeys[tomId].push(key); });
  Object.keys(tomAudioMap).forEach(tomId => {
    const boton = document.getElementById(tomId);
    if (!boton) return;
    const keySpan = boton.querySelector('.battery-tom-info-key');
    const soundSpan = boton.querySelector('.battery-tom-info-sound');
    if (keySpan) {
      const keys = (tomToKeys[tomId] || []).map(k => prettyLabelFromId(k)).join(' / ');
      keySpan.textContent = keys || '—';
    }
    if (soundSpan) {
      const fullName = prettyName(tomAudioMap[tomId]);
      soundSpan.textContent = fullName;
      soundSpan.title = fullName;
    }
  });
}

function actualizarEtiquetasTeclas(keyMap) {
  const tomToKeys = {};
  Object.entries(keyMap).forEach(([key, tomId]) => { tomToKeys[tomId] = tomToKeys[tomId] || []; tomToKeys[tomId].push(key); });
  Object.keys(tomAudioMap).forEach(tomId => {
    const boton = document.getElementById(tomId);
    if (!boton) return;
    const span = boton.querySelector('.battery-tom-key');
    const keys = tomToKeys[tomId] || [];
    if (span) span.textContent = keys.map(k => prettyLabelFromId(k)).join(' / ');
  });
}

const IMMERSION_STORAGE_KEY = 'pianoChampeteroImmersionMode';

function setImmersionMode(on) {
  document.body.classList.toggle('immersion-mode', on);
  const btn = document.getElementById('immersion-btn');
  if (btn) {
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Mostrar menú y cinta' : 'Ocultar menú y cinta para más espacio';
    const icon = btn.querySelector('i');
    const label = btn.querySelector('.immersion-btn-label');
    if (icon) icon.className = on ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    if (label) label.textContent = on ? 'Salir' : 'Inmersión';
  }
  try { localStorage.setItem(IMMERSION_STORAGE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
}

function initImmersionMode() {
  const btn = document.getElementById('immersion-btn');
  if (!btn) return;
  setImmersionMode(document.body.classList.contains('immersion-mode'));
  btn.addEventListener('click', () => {
    setImmersionMode(!document.body.classList.contains('immersion-mode'));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const isMainPage = document.getElementById('tom-1') !== null;
  await initSiteChrome();
  const navVirtual = document.getElementById('nav-virtual');
  if (navVirtual) navVirtual.classList.add('active');
  setYearFooter();
  resumeOnUserGesture();

  if (!isMainPage) return;

  initAudioVisualizer({ analyser });
  initAudioWarmup();

  const savedKeys = loadKeyMapping();
  if (savedKeys) keyToTomId = normalizeKeyMap(savedKeys);
  else keyToTomId = normalizeKeyMap(keyToTomIdDefaults);

  // Preload agresivo de samplers
  await preloadAllSamplers();
  actualizarEtiquetasTeclas(keyToTomId);
  actualizarNombresPads();

  const sliderVolumen = document.getElementById('volume-slider');
  const labelPorcentaje = document.getElementById('volume-percent');
  if (sliderVolumen) {
    const actualizarLabel = v => labelPorcentaje && (labelPorcentaje.textContent = Math.round(v * 100) + '%');
    sliderVolumen.value = String(_currentVolume);
    if (labelPorcentaje) actualizarLabel(_currentVolume);
    sliderVolumen.addEventListener('input', e => {
      _currentVolume = +e.target.value;
      currentVolume = _currentVolume;
      saveStoredVolume(_currentVolume);
      if (labelPorcentaje) actualizarLabel(_currentVolume);
    });
    sliderVolumen.addEventListener('wheel', e => {
      e.preventDefault();
      const step = parseFloat(sliderVolumen.step) || 0.01;
      let nuevoValor = parseFloat(sliderVolumen.value) + (e.deltaY < 0 ? step : -step);
      nuevoValor = Math.max(parseFloat(sliderVolumen.min), Math.min(parseFloat(sliderVolumen.max), nuevoValor));
      sliderVolumen.value = nuevoValor;
      sliderVolumen.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  const editBtn = document.getElementById('edit-btn');
  const modal = document.getElementById('modal-edit');
  const samplerListEl = document.getElementById('sampler-list');
  const samplerBrowserRoot = document.getElementById('sampler-browser');
  const tabSampler = document.getElementById('tab-sampler');
  const tabKey = document.getElementById('tab-key');
  const keyInput = document.getElementById('new-key-input');
  const saveBtn = document.getElementById('save-edit-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  const tabs = modal ? modal.querySelectorAll('.modal-tab') : [];

  const previewDeps = {
    getVolume: () => _currentVolume,
    loadBuffer: loadSamplerBuffer,
    connectHit: connectHitToOutput,
    pulseViz: pulseAudioVisualizer,
  };

  function previewSamplerFile(relativePath) {
    void previewSamplerPath(audioCtx, relativePath, previewDeps);
  }

  function fillSamplerTab(currentPath, onPick) {
    if (!samplerBrowserRoot) return;
    mountSamplerBrowser(samplerBrowserRoot, {
      currentPath,
      legacyList: samplerList,
      onSelect: onPick,
      onPreview: previewSamplerFile,
    });
  }

  function switchTab(tab) {
    activeTab = tab;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    if (tabSampler) tabSampler.style.display = tab === 'sampler' ? '' : 'none';
    if (tabKey) tabKey.style.display = tab === 'key' ? '' : 'none';
    if (tab === 'key' && keyInput) {
      if (padSeleccionado !== null && padSeleccionado !== undefined) {
        const total = gridConfigs[currentGridType]?.total || 0;
        keyInput.value = padKeyDisplayLabel(padSeleccionado, total);
      } else if (tomSeleccionado) {
        const tomId = tomSeleccionado.id;
        const codes = Object.keys(keyToTomId)
          .filter(k => keyToTomId[k] === tomId)
          .map(k => {
            if (/^Key[A-Z]$/.test(k) || /^Digit[0-9]$/.test(k) || /^Numpad[0-9]$/.test(k)) return k;
            if (/^[a-z]$/.test(k)) return 'Key' + k.toUpperCase();
            if (/^[0-9]$/.test(k)) return 'Digit' + k;
            return null;
          })
          .filter(Boolean)
          .sort();
        keyInput.value = codes.length ? prettyLabelFromId(codes[0]) : '';
      } else {
        keyInput.value = '';
      }
      keyInput.focus();
    }
  }

  tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  function abrirModal(boton) {
    tomSeleccionado = boton;
    padSeleccionado = null;
    lastCapturedCode = null;
    switchTab('sampler');
    samplerSeleccionado = tomAudioMap[boton.id] || null;
    padSamplerSeleccionado = null;
    fillSamplerTab(samplerSeleccionado || '', (path) => { samplerSeleccionado = path; });
    if (keyInput) keyInput.value = '';
    if (editModal) editModal.open();
    else if (modal) modal.style.display = 'flex';
  }

  function cerrarModal() {
    stopSamplerPreview();
    tomSeleccionado = null;
    samplerSeleccionado = null;
    if (editModal) editModal.close();
    else if (modal) modal.style.display = 'none';
  }

  /** @type {ReturnType<typeof initModal> | null} */
  let editModal = null;

  if (editBtn) editBtn.addEventListener('click', () => {
    modoEdicion = !modoEdicion;
    editBtn.innerHTML = modoEdicion
      ? '<i class="fa-solid fa-check" aria-hidden="true"></i> Listo'
      : '<i class="fa-solid fa-pencil" aria-hidden="true"></i> Editar';
    editBtn.classList.toggle('edit-mode-active', modoEdicion);
    editBtn.setAttribute('aria-pressed', modoEdicion ? 'true' : 'false');
    editBtn.title = modoEdicion
      ? 'Salir del modo edición y volver a tocar la batería'
      : 'Cambiar sonidos y teclas de los pads';
    document.body.classList.toggle('edit-mode', modoEdicion);
    const editHint = document.getElementById('edit-mode-hint');
    if (editHint) editHint.hidden = !modoEdicion;
    if (modoEdicion) {
      keysHeldForRepeat.clear();
      stopAllNoteRepeat();
    }
    if (!modoEdicion) cerrarModal();
  });

  // View toggle buttons
  const viewBateriaBtn = document.getElementById('view-bateria');
  const viewPadsBtn = document.getElementById('view-pads');
  if (viewBateriaBtn) viewBateriaBtn.addEventListener('click', () => switchView('bateria'));
  if (viewPadsBtn) viewPadsBtn.addEventListener('click', () => switchView('pads'));

  const gridOptionsRoot = document.getElementById('grid-options');
  if (gridOptionsRoot) {
    gridOptionsRoot.addEventListener('click', e => {
      const btn = e.target.closest('.grid-opt');
      if (!btn || !btn.dataset.grid) return;
      changeGrid(btn.dataset.grid);
    });
  }

  // Pad edit modal for pads view (wired to module-level generatePadsView via openPadEditModalRef)
  function openPadEditModal(padIndex) {
    tomSeleccionado = null;
    padSeleccionado = padIndex;
    padSamplerSeleccionado = padsViewState[padIndex] || null;
    samplerSeleccionado = null;
    lastCapturedCode = null;
    switchTab('sampler');
    fillSamplerTab(padSamplerSeleccionado || '', (path) => { padSamplerSeleccionado = path; });
    if (editModal) editModal.open();
    else if (modal) modal.style.display = 'flex';
  }
  openPadEditModalRef = openPadEditModal;

  // Initialize view after pad editor ref is ready (generatePadsView needs it for Editar + pads)
  if (currentViewMode === 'pads') {
    switchView('pads');
  } else {
    switchView('bateria');
  }

  // Navegación con flechas en la lista de samplers
  if (modal) {
    modal.addEventListener('keydown', e => {
      if (activeTab === 'sampler' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const items = samplerListEl ? Array.from(samplerListEl.querySelectorAll('.sampler-item')) : [];
        if (items.length === 0) return;
        const currentIndex = items.findIndex(item => item.classList.contains('selected'));
        let newIndex;
        if (e.key === 'ArrowDown') {
          newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        } else {
          newIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        }
        items[newIndex].click();
        items[newIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  if (keyInput) keyInput.addEventListener('keydown', ev => {
    ev.stopPropagation();
    lastCapturedCode = ev.code || null;
    if (ev.key === 'Escape') { cerrarModal(); return; }
    if (ev.key === 'Enter') { if (saveBtn) saveBtn.click(); return; }
    ev.preventDefault();
    const label = prettyLabelFromId(ev.code);
    keyInput.value = label;
  });

  Object.keys(tomAudioMap).forEach(tomId => {
    const boton = document.getElementById(tomId);
    if (boton) {
      boton.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (modoEdicion) {
          e.preventDefault();
          e.stopPropagation();
          abrirModal(boton);
          return;
        }
        activateTomSampler(tomId);
        beginTomNoteRepeat(tomId);
        try { boton.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      });
      boton.addEventListener('pointerup', () => endTomNoteRepeat(tomId));
      boton.addEventListener('pointercancel', () => endTomNoteRepeat(tomId));
    }
  });

  function keyboardHoldId(e) {
    return e.code || e.key || '';
  }

  function releaseKeyboardHold(e) {
    const holdId = keyboardHoldId(e);
    if (!holdId || !keysHeldForRepeat.has(holdId)) return;
    keysHeldForRepeat.delete(holdId);

    if (currentViewMode === 'pads') {
      const padIndex = resolvePadIndexFromKeyboard(e, keyToPadIndex);
      if (padIndex !== undefined) endPadNoteRepeat(padIndex);
      return;
    }

    const code = e.code || '';
    const inferredKey = (/^[0-9]$/.test(e.key)) ? ('Digit' + e.key) : ('Key' + (e.key || '').toUpperCase());
    const tomId = keyToTomId[code] || keyToTomId[inferredKey] || keyToTomId[(e.key || '').toLowerCase()];
    if (tomId) endTomNoteRepeat(tomId);
  }

  document.addEventListener('keydown', e => {
    if (modal && modal.style.display === 'flex') return;
    if (modoEdicion) return;
    if (e.repeat) return;
    const code = e.code || '';
    if (!e.key && !code) return;
    const holdId = keyboardHoldId(e);
    if (keysHeldForRepeat.has(holdId)) return;

    const inferredKey = (/^[0-9]$/.test(e.key)) ? ('Digit' + e.key) : ('Key' + (e.key || '').toUpperCase());

    if (currentViewMode === 'pads') {
      const padIndex = resolvePadIndexFromKeyboard(e, keyToPadIndex);
      if (padIndex === undefined) return;
      e.preventDefault();
      keysHeldForRepeat.add(holdId);
      activatePadSound(padIndex);
      beginPadNoteRepeat(padIndex);
    } else {
      const tomId = keyToTomId[code] || keyToTomId[inferredKey] || keyToTomId[(e.key || '').toLowerCase()];
      if (!tomId) return;
      e.preventDefault();
      keysHeldForRepeat.add(holdId);
      activateTomSampler(tomId);
      beginTomNoteRepeat(tomId);
    }
  }, true);

  document.addEventListener('keyup', e => {
    if (modoEdicion) return;
    releaseKeyboardHold(e);
  }, true);

  window.addEventListener('blur', () => {
    keysHeldForRepeat.clear();
    stopAllNoteRepeat();
  });

  window.addEventListener('focus', async () => {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    await preloadAllSamplers();
    if (currentViewMode === 'pads') {
      const config = gridConfigs[currentGridType];
      for (let i = 0; i < config.total; i++) {
        const buf = await preloadPadsViewBuffer(i);
        if (buf) padsViewBuffers[i] = buf;
      }
    }
  });

  // ===== INICIALIZAR MODALES =====

  editModal = initModal('modal-edit', {
    closeBtnId: 'cancel-edit-btn',
    confirmBtnId: 'save-edit-btn',
    focusOnOpen: false,
    onConfirm: async () => {
      if (padSeleccionado !== null && padSeleccionado !== undefined) {
        const totalPads = gridConfigs[currentGridType]?.total || 0;
        let padModalDidChange = false;
        if (padSamplerSeleccionado) {
          padsViewState[padSeleccionado] = padSamplerSeleccionado;
          savePadsViewSounds(currentGridType, padsViewState);
          const buf = await preloadPadsViewBuffer(padSeleccionado);
          if (buf) padsViewBuffers[padSeleccionado] = buf;
          padModalDidChange = true;
        }
        if (lastCapturedCode) {
          Object.keys(keyToPadIndex).forEach(k => {
            if (keyToPadIndex[k] === padSeleccionado) delete keyToPadIndex[k];
          });
          delete keyToPadIndex[lastCapturedCode];
          const mkPad = /^Key([A-Z])$/.exec(lastCapturedCode);
          if (mkPad) delete keyToPadIndex[mkPad[1].toLowerCase()];
          keyToPadIndex[lastCapturedCode] = padSeleccionado;
          if (mkPad) keyToPadIndex[mkPad[1].toLowerCase()] = padSeleccionado;
          normalizePlayablePadKeyMap(keyToPadIndex, totalPads);
          persistPadKeysForCurrentGrid();
          padModalDidChange = true;
        }
        if (padModalDidChange) generatePadsView();
      } else if (tomSeleccionado) {
        const tomId = tomSeleccionado.id;
        if (samplerSeleccionado) {
          tomAudioMap[tomId] = samplerSeleccionado;
          const buf = await preloadSamplerFile(samplerSeleccionado);
          if (buf) tomSamplerBuffers[samplerSeleccionado] = buf;
          saveSamplers();
          actualizarNombresPads();
        }
        if (lastCapturedCode) {
          Object.keys(keyToTomId).forEach(k => { if (keyToTomId[k] === tomId) delete keyToTomId[k]; });
          if (keyToTomId[lastCapturedCode]) delete keyToTomId[lastCapturedCode];
          keyToTomId[lastCapturedCode] = tomId;
          saveKeyMapping(keyToTomId);
          actualizarEtiquetasTeclas(keyToTomId);
          actualizarNombresPads();
        }
      }
    },
    onClose: () => {
      stopSamplerPreview();
      tomSeleccionado = null;
      samplerSeleccionado = null;
      padSeleccionado = null;
      padSamplerSeleccionado = null;
    }
  });

  initModal('modal-confirm-reset', {
    openBtnId: 'reset-settings-btn',
    closeBtnId: 'cancel-reset-btn',
    confirmBtnId: 'confirm-reset-btn',
    onConfirm: async () => {
      resetSettings();
      await preloadAllSamplers();
      keyToTomId = normalizeKeyMap(keyToTomIdDefaults);
      actualizarEtiquetasTeclas(keyToTomId);
      actualizarNombresPads();
      if (currentViewMode === 'pads') generatePadsView();
    }
  });

  initModal('modal-help', {
    openBtnId: 'help-btn',
    closeBtnId: 'close-help-btn'
  });

  initImmersionMode();
});