// js/virtual.js — batería virtual.html
// Hit path: buffer en RAM → start(0) sync; flash/DOM después; volumen en masterGain
import { initSiteChrome, setYearFooter, resumeOnUserGesture } from './common.js';
import {
  AUDIO_UI,
  NAV_MOBILE_MAX_PX,
  BREAKPOINT_DESKTOP_MIN_PX,
} from './site-config.js';
import { PAD_GRID_CONFIGS as gridConfigs, PAD_GRID_SIZE_ORDER } from './pad-grid-config.js';
import { initModal, isModalOpen } from './modal-utils.js';
import { DEFAULT_PAD_KEY_CHAR_ORDER, BATTERY_DEFAULT_PAD_CHARS, buildPadKeyIndexMap, resolvePadIndexFromKeyboard } from './pad-keyboard.js';
import { initAudioBus, connectHitToOutput, getMasterGain } from './audio-bus.js';
// Local setter — do not named-import setMasterVolume: stale SW audio-bus.js lacks that export and kills the page
function setMasterVolume(value) {
  const gain = getMasterGain();
  if (gain) gain.gain.value = Math.min(1, Math.max(0, value));
}
import { initAudioVisualizer, pulseAudioVisualizer } from './audio-visualizer.js';
import { resolveSamplerPath, samplerUrl, samplerBasename } from './sampler-path.js';
import { mountSamplerBrowser, loadSamplerCatalog } from './sampler-browser.js';
import { isNoteRepeatEnabled, setNoteRepeatEnabled, startNoteRepeat, stopNoteRepeat, stopAllNoteRepeat, noteRepeatIntervalMs, setNoteRepeatIntervalMs, noteRepeatSliderToMs, noteRepeatMsToSlider, noteRepeatRateLabel } from './note-repeat.js';
import { stopSamplerPreview, previewSamplerPath } from './sampler-preview.js';
import {
  collectKitSnapshot,
  encodeKitSnapshot,
  decodeKitToken,
  buildKitShareUrl,
  buildWhatsAppSendUrl,
  buildShareMessage,
  persistKitSnapshot,
  kitTokenFromPageUrl,
} from './kit-config-share.js';
import { initSessionRecorder, listSessionRecordings } from './session-recorder.js';
import { getActiveKitId, getBatteryKit, initBatteryPresets, isActiveKitBlank, isDefaultKit, syncActiveKit, updateBatteryKit } from './battery-presets.js';
import {
  initPatternLoops,
  notifyPatternHit,
  stopPatternLoop,
  stopPatternCapture,
  isPatternCapturing,
  listPatternLoops,
} from './pattern-loop.js';

// Interactive + native device rate (forced 48k resampled on many phones → extra latency)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
  latencyHint: 'interactive',
});

const { analyser } = initAudioBus(audioCtx);

const HIT_FLASH_MS = AUDIO_UI.hitFlashMs;
const RETRIGGER_MASK_SEC = (AUDIO_UI.retriggerMaskMs ?? 45) / 1000;

/** @type {Map<string, number>} voiceKey → audioContext.currentTime */
const lastTriggerAt = new Map();
/** @type {Map<string, { source: AudioBufferSourceNode }>} */
const activeVoices = new Map();
/** Keyboard codes currently held (our note repeat, not OS repeat). */
const keysHeldForRepeat = new Set();

function tomVoiceKey(tomId) {
  return `tom:${tomId}`;
}

function padVoiceKey(index) {
  return `pad:${index}`;
}

/** Mobile piano-glide: pointerId → last pad/tom under finger (null = gap). */
const glidePointers = new Map();
/** Declared early: hitPlayTarget reads it during glide. */
let modoEdicion = false;

function glideTargetsEqual(a, b) {
  if (!a || !b) return a === b;
  return a.kind === b.kind && String(a.id) === String(b.id);
}

// ponytail: ceiling = no DOM swipe test; upgrade = Playwright finger glide
console.assert(glideTargetsEqual({ kind: 'pad', id: 0 }, { kind: 'pad', id: 0 }));
console.assert(!glideTargetsEqual({ kind: 'pad', id: 0 }, { kind: 'pad', id: 1 }));

function hitPlayTarget(clientX, clientY) {
  if (modoEdicion) return null;
  const el = document.elementFromPoint(clientX, clientY);
  if (!(el instanceof Element)) return null;
  const pad = el.closest('.pad-item[data-pad-index]');
  if (pad) {
    const id = Number(pad.dataset.padIndex);
    if (Number.isFinite(id)) return { kind: 'pad', id };
  }
  const tom = el.closest('button.battery-tom[id^="tom-"]');
  if (tom?.id) return { kind: 'tom', id: tom.id };
  return null;
}

function glideEnter(target) {
  if (!target) return;
  if (target.kind === 'pad') {
    activatePadSound(target.id);
    beginPadNoteRepeat(target.id);
  } else {
    activateTomSampler(target.id);
    beginTomNoteRepeat(target.id);
  }
}

function glideLeave(target) {
  if (!target) return;
  if (target.kind === 'pad') endPadNoteRepeat(target.id);
  else endTomNoteRepeat(target.id);
}

function beginPlayGlide(e, target) {
  glidePointers.set(e.pointerId, target);
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch { /* ignore */ }
}

function onPlayGlideMove(e) {
  if (!glidePointers.has(e.pointerId)) return;
  const prev = glidePointers.get(e.pointerId);
  const next = hitPlayTarget(e.clientX, e.clientY);
  if (glideTargetsEqual(prev, next)) return;
  glideLeave(prev);
  if (next) glideEnter(next);
  glidePointers.set(e.pointerId, next);
}

function endPlayGlide(e) {
  if (!glidePointers.has(e.pointerId)) return;
  glideLeave(glidePointers.get(e.pointerId));
  glidePointers.delete(e.pointerId);
}

function initPlayGlide() {
  document.addEventListener('pointermove', onPlayGlideMove, { capture: true, passive: true });
  document.addEventListener('pointerup', endPlayGlide, { capture: true });
  document.addEventListener('pointercancel', endPlayGlide, { capture: true });
  window.addEventListener('blur', () => {
    for (const target of glidePointers.values()) glideLeave(target);
    glidePointers.clear();
  });
}

const tomSamplersDefaults = {
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
const samplerList = [
  'Originales web/COMO DD14.wav', 'Originales web/ctm6.wav', 'Originales web/DEEJAY.mp3', 'Originales web/EFECTO SANTOYA-TRA.wav',
  'Originales web/EXELENT.wav', 'Originales web/FOUR-1.wav', 'Originales web/piii Samples.wav', 'Originales web/Yeut01 Sk.wav',
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

const tomAudioMap = (function init() {
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

const keyToTomIdDefaults = Object.fromEntries(
  BATTERY_DEFAULT_PAD_CHARS.map((ch, i) => [ch, `tom-${i + 1}`])
);

const tomSamplerBuffers = {};
const VOLUME_STORAGE_KEY = 'pianoChampeteroVolume';
const DEFAULT_VOLUME = 0.5;
const RATE_STORAGE_KEY = 'pianoChampeteroPlaybackRate';
const RATE_FIXED_STORAGE_KEY = 'pianoChampeteroPlaybackRateFixed';
const PLAYBACK_RATE_MIN = AUDIO_UI.playbackRate?.min ?? 0.5;
const PLAYBACK_RATE_MAX = AUDIO_UI.playbackRate?.max ?? 2;
const DEFAULT_PLAYBACK_RATE = AUDIO_UI.playbackRate?.default ?? 1;

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

/** Slider 0..100 (50 = normal). Left slower, right faster. */
function playbackRateFromSlider(sliderValue) {
  const t = Math.min(100, Math.max(0, Number(sliderValue) || 0));
  if (t <= 50) return PLAYBACK_RATE_MIN + (t / 50) * (1 - PLAYBACK_RATE_MIN);
  return 1 + ((t - 50) / 50) * (PLAYBACK_RATE_MAX - 1);
}

function sliderFromPlaybackRate(rate) {
  const r = Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, Number(rate) || 1));
  if (r <= 1) return Math.round(((r - PLAYBACK_RATE_MIN) / (1 - PLAYBACK_RATE_MIN)) * 50);
  return Math.round(50 + ((r - 1) / (PLAYBACK_RATE_MAX - 1)) * 50);
}

function formatPlaybackRate(rate) {
  return `${Number(rate).toFixed(2)}×`;
}

// ponytail: ceiling = no audio output assert; upgrade = Web Audio rate probe
console.assert(Math.abs(playbackRateFromSlider(50) - 1) < 1e-9);
console.assert(Math.abs(playbackRateFromSlider(0) - PLAYBACK_RATE_MIN) < 1e-9);
console.assert(Math.abs(playbackRateFromSlider(100) - PLAYBACK_RATE_MAX) < 1e-9);
console.assert(sliderFromPlaybackRate(1) === 50);

function readStoredPlaybackRate() {
  try {
    const raw = localStorage.getItem(RATE_STORAGE_KEY);
    if (raw == null) return DEFAULT_PLAYBACK_RATE;
    const v = parseFloat(raw);
    return Number.isFinite(v)
      ? Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, v))
      : DEFAULT_PLAYBACK_RATE;
  } catch {
    return DEFAULT_PLAYBACK_RATE;
  }
}

function saveStoredPlaybackRate(v) {
  try { localStorage.setItem(RATE_STORAGE_KEY, String(v)); } catch { /* ignore */ }
}

function readStoredRateFixed() {
  try {
    return localStorage.getItem(RATE_FIXED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveStoredRateFixed(fixed) {
  try {
    localStorage.setItem(RATE_FIXED_STORAGE_KEY, fixed ? '1' : '0');
  } catch { /* ignore */ }
}

let currentVolume = readStoredVolume();
setMasterVolume(currentVolume);
let currentPlaybackRate = readStoredPlaybackRate();
let playbackRateFixed = readStoredRateFixed();

let keyToTomId = {};

function predecessorGridType(gridType) {
  const i = PAD_GRID_SIZE_ORDER.indexOf(gridType);
  return i > 0 ? PAD_GRID_SIZE_ORDER[i - 1] : null;
}

function getDefaultPadsSounds(total, sourceMap = tomAudioMap) {
  // Hereda los sonidos configurados en la vista batería
  const bateriaSounds = Object.values(sourceMap).filter(Boolean);
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

let currentViewMode = 'pads';
localStorage.setItem('pianoChampeteroViewMode', 'pads');
let currentGridType = localStorage.getItem('pianoChampeteroGridType') || '3x4';

// Validar que el grid type exista, si no usar default
if (!gridConfigs[currentGridType]) currentGridType = '3x4';

let padsViewState = loadPadsViewSounds(currentGridType);
let padsViewBuffers = {};

// Cache global de TODOS los samplers cargados (evita re-fetch)
const globalSamplerCache = {};
/** @type {Record<string, Promise<AudioBuffer>>} */
const globalSamplerLoading = {};

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
  let s = stored.replace(/^Legado sitio\//, 'Originales web/').replace(/\\/g, '/');
  s = s.replace(/^(Originales web\/)00/, '$1');
  if (/^00/.test(s) && !s.includes('/')) s = s.slice(2);
  return s;
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
  const preserveBlank = shouldPreserveBlankAssignments();
  let changed = false;
  Object.keys(tomAudioMap).forEach((tomId) => {
    const stored = tomAudioMap[tomId];
    if (stored === '' && preserveBlank) return;
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
    if (p === '' && preserveBlank) return p;
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

/** Unlock AudioContext early (capture) so hit path rarely waits on resume(). */
function initAudioWarmup() {
  let primed = false;
  const warm = () => {
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    // iOS: silent buffer on first gesture unlocks output before the real hit
    if (primed) return;
    primed = true;
    try {
      const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
    } catch { /* ignore */ }
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

/** While applying a blank preset before activeKitId switches (create «Desde 0»). */
let applyingBlankPreset = false;

function shouldPreserveBlankAssignments() {
  return applyingBlankPreset || isActiveKitBlank();
}

/** Set from DOMContentLoaded: generatePadsView lives at module scope and cannot see nested functions. */
let openPadEditModalRef = null;

function padKeysStorageKey(gridType) {
  return `pianoChampeteroPadKeys_${gridType}`;
}

function loadPadKeysSavedObject(gridType) {
  try {
    const raw = localStorage.getItem(padKeysStorageKey(gridType));
    if (raw === null) return null;
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
  const hasAny = Object.values(keyToPadIndex).some((v) => typeof v === 'number');
  if (!hasAny) {
    try {
      localStorage.setItem(padKeysStorageKey(currentGridType), JSON.stringify({}));
    } catch { /* ignore */ }
    return;
  }
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
  if (saved !== null && Object.keys(saved).length > 0) {
    return buildPadKeyMapFromSaved(total, saved);
  }
  if (saved !== null && Object.keys(saved).length === 0 && shouldPreserveBlankAssignments()) {
    return {};
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

function saveKeyMapping(map) { try { const normalized = normalizeKeyMap(map); localStorage.setItem('pianoChampeteroKeyMap', JSON.stringify(normalized)); } catch (e) {} }
function loadKeyMapping() {
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
  if (!shouldPreserveBlankAssignments() && padIndex < DEFAULT_PAD_KEY_CHAR_ORDER.length) {
    return DEFAULT_PAD_KEY_CHAR_ORDER[padIndex].toUpperCase();
  }
  return '';
}

function prettyName(fileName) {
  if (!fileName) return '';
  let name = samplerBasename(fileName).replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  // Strip leading zeros/digits only if followed by text (e.g. "00COMO DD14" -> "COMO DD14")
  // Keep pure numbers like "142" intact
  name = name.replace(/^[\d\s]+(?=[^\d\s])/, '');
  return name.trim();
}

function saveSamplers() {
  const payload = {};
  Object.keys(tomAudioMap).forEach(k => {
    payload[k] = tomAudioMap[k] ? tomAudioMap[k].replace(/\\/g, '/') : '';
  });
  try { localStorage.setItem('pianoChampeteroSamplers', JSON.stringify(payload)); } catch {}
}

function resetSettings() {
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

async function loadAvailableSamplers() {
  rebuildSamplerIndexes([...samplerList]);

  const cat = await loadSamplerCatalog().catch(() => null);
  if (cat?.files?.length) {
    rebuildSamplerIndexes([...samplerList, ...cat.files.map((f) => f.path)]);
  }

  reconcileSamplerAssignments();
}

// Carga un sampler con cache global (evita re-fetch); una sola promesa por URL en vuelo
async function loadSamplerBuffer(url) {
  if (globalSamplerCache[url]) return globalSamplerCache[url];
  if (globalSamplerLoading[url]) return globalSamplerLoading[url];
  globalSamplerLoading[url] = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Sampler HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      // slice: decodeAudioData may detach the buffer (Safari); keep original fetch reusable
      const buffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      globalSamplerCache[url] = buffer;
      return buffer;
    } finally {
      delete globalSamplerLoading[url];
    }
  })();
  return globalSamplerLoading[url];
}

// Preload: solo sonidos asignados (batería + pads actuales). Catálogo = bajo demanda en Editar.
async function preloadAllSamplers() {
  await loadAvailableSamplers();
  await Promise.all([...assignedSamplerPaths()].map((fileName) => preloadSamplerFile(fileName)));
}


function playSamplerVoice(buffer, voiceKey, { force = false } = {}) {
  const now = audioCtx.currentTime;
  const last = lastTriggerAt.get(voiceKey) ?? 0;
  // Ghost-tap shield; note-repeat ticks pass force so mask never skips a beat
  if (!force && now - last < RETRIGGER_MASK_SEC) return;

  const prev = activeVoices.get(voiceKey);
  if (prev) {
    try { prev.source.stop(); } catch { /* already stopped */ }
    activeVoices.delete(voiceKey);
  }

  lastTriggerAt.set(voiceKey, now);

  // No per-hit GainNode — volume on masterGain (audio-bus)
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = currentPlaybackRate;
  connectHitToOutput(source);

  const voice = { source };
  activeVoices.set(voiceKey, voice);
  source.onended = () => {
    if (activeVoices.get(voiceKey) === voice) activeVoices.delete(voiceKey);
  };

  source.start(0);
  pulseAudioVisualizer();
}

/** Live pitch bend: update voices already playing. */
function applyPlaybackRateToActiveVoices(rate) {
  for (const voice of activeVoices.values()) {
    try {
      voice.source.playbackRate.value = rate;
    } catch { /* stopped */ }
  }
}

function setPlaybackRate(rate, { persist = false } = {}) {
  currentPlaybackRate = Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, rate));
  applyPlaybackRateToActiveVoices(currentPlaybackRate);
  if (persist) saveStoredPlaybackRate(currentPlaybackRate);
}

// PLAY: buffer ya en RAM, start(0), sin await
function playTomSampler(tomId, { force = false } = {}) {
  const fileName = tomAudioMap[tomId];
  if (!fileName) return;
  const url = samplerUrl(fileName);
  const buffer = tomSamplerBuffers[fileName] || globalSamplerCache[url];
  if (!buffer) {
    void preloadSamplerFile(fileName);
    return;
  }
  playSamplerVoice(buffer, `tom:${tomId}`, { force });
}

/** @param {HTMLElement | null | undefined} el */
function flashHitElement(el) {
  if (!el) return;
  if (el._flashTimer) clearTimeout(el._flashTimer);
  el.classList.remove('active');
  // Defer DOM/CSS — never force reflow before audio start(0)
  requestAnimationFrame(() => {
    el.classList.add('active');
    el._flashTimer = setTimeout(() => {
      el.classList.remove('active');
      el._flashTimer = undefined;
    }, HIT_FLASH_MS);
  });
}

function flashTomButton(tomId) {
  flashHitElement(document.getElementById(tomId));
}

function activateTomSampler(tomId, { flash = true } = {}) {
  // Audio first — flash/pattern after (ms matter on mobile)
  if (audioCtx.state === 'running') playTomSampler(tomId);
  else void audioCtx.resume().then(() => playTomSampler(tomId));
  if (isPatternCapturing()) notifyPatternHit({ kind: 'tom', id: tomId });
  if (flash) flashTomButton(tomId);
}

function beginTomNoteRepeat(tomId) {
  if (!isNoteRepeatEnabled()) return;
  const key = tomVoiceKey(tomId);
  startNoteRepeat(key, () => {
    flashTomButton(tomId);
    playTomSampler(tomId, { force: true });
  });
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

function switchView(_view) {
  // Pads-only product surface — battery view removed from UI.
  currentViewMode = 'pads';
  localStorage.setItem('pianoChampeteroViewMode', 'pads');

  const padsView = document.getElementById('pads-view');
  const gridSelector = document.getElementById('grid-selector');
  if (padsView) padsView.classList.remove('hidden');
  if (gridSelector) gridSelector.style.display = 'flex';
  generateGridOptions();
  generatePadsView();
  scheduleResponsivePadsLayout();
  refreshBatteryPresets();
}

function changeGrid(gridType) {
  currentGridType = gridType;
  localStorage.setItem('pianoChampeteroGridType', gridType);
  padsViewState = loadPadsViewSounds(gridType);
  generateGridOptions();
  const padsGrid = document.getElementById('pads-grid');
  padsGrid.className = 'pads-grid grid-' + gridType;
  generatePadsView();
  scheduleResponsivePadsLayout();
}

async function preloadPadsViewBuffer(index) {
  const fileName = padsViewState[index];
  if (!fileName) return null;
  return await preloadSamplerFile(fileName);
}

function playPadSound(index, { force = false } = {}) {
  const fileName = padsViewState[index];
  const url = fileName ? samplerUrl(fileName) : '';
  const buffer = padsViewBuffers[index] || (url ? globalSamplerCache[url] : null);
  if (!buffer) {
    if (fileName) void preloadPadsViewBuffer(index).then((buf) => { if (buf) padsViewBuffers[index] = buf; });
    return;
  }
  playSamplerVoice(buffer, `pad:${index}`, { force });
}

function flashPadButton(index) {
  flashHitElement(document.getElementById('pads-grid')?.children[index]);
}

function activatePadSound(index, { flash = true } = {}) {
  if (audioCtx.state === 'running') playPadSound(index);
  else void audioCtx.resume().then(() => playPadSound(index));
  if (isPatternCapturing()) notifyPatternHit({ kind: 'pad', id: index });
  if (flash) flashPadButton(index);
}

function beginPadNoteRepeat(index) {
  if (!isNoteRepeatEnabled()) return;
  const key = padVoiceKey(index);
  startNoteRepeat(key, () => {
    flashPadButton(index);
    playPadSound(index, { force: true });
  });
}

function endPadNoteRepeat(index) {
  stopNoteRepeat(padVoiceKey(index));
}

function generatePadsView() {
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
    soundLabel.textContent = prettyName(padsViewState[i]) || '—';

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
      e.preventDefault();
      const target = { kind: 'pad', id: i };
      activatePadSound(i);
      beginPadNoteRepeat(i);
      beginPlayGlide(e, target);
    });
  }

  // Preload buffers en paralelo para pads view
  Object.keys(padsViewBuffers).forEach(k => delete padsViewBuffers[k]);
  if (config.total > 0) {
    Promise.all(Array.from({length: config.total}, (_, i) =>
      preloadPadsViewBuffer(i).then(buf => { if (buf) padsViewBuffers[i] = buf; })
    ));
  }
}

let refreshBatteryPresets = () => {};
/** @type {{ refresh?: () => void, onEditEnter?: () => void, onEditExit?: () => void } | null} */
let batteryPresetsCtl = null;
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
    const soundSpan = boton.querySelector('.battery-tom-info-sound');
    if (soundSpan) {
      const fullName = prettyName(tomAudioMap[tomId]);
      soundSpan.textContent = fullName || '—';
      soundSpan.title = fullName || 'Sin sonido';
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
  setTimeout(scheduleResponsivePadsLayout, 450);
}

function initImmersionMode() {
  const btn = document.getElementById('immersion-btn');
  if (!btn) return;
  setImmersionMode(document.body.classList.contains('immersion-mode'));
  btn.addEventListener('click', () => {
    setImmersionMode(!document.body.classList.contains('immersion-mode'));
  });
}

/**
 * "Más" only when controls don't fit one row (overflow), any tier.
 * Not tied to mobile MQ — desktop with space never shows the button.
 */
function initMoreControls() {
  const bar = document.querySelector('.virtual-page .controls-bar');
  const btn = document.getElementById('more-controls-btn');
  const panel = document.getElementById('more-controls-panel');
  if (!bar || !btn || !panel) return;

  let open = false;
  let syncing = false;

  const applyExpanded = () => {
    bar.classList.remove('controls-bar--overflow', 'controls-bar--more-open');
    btn.hidden = true;
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'false');
  };

  const applyOverflow = (isOpen) => {
    bar.classList.add('controls-bar--overflow');
    bar.classList.toggle('controls-bar--more-open', isOpen);
    btn.hidden = false;
    panel.hidden = !isOpen;
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };

  const setOpen = (next) => {
    open = !!next;
    if (!bar.classList.contains('controls-bar--overflow')) {
      open = false;
      applyExpanded();
      return;
    }
    applyOverflow(open);
  };

  const measureNeedsOverflow = () => {
    // Expande + nowrap pa’ medir si caben todos en una fila
    applyExpanded();
    bar.style.flexWrap = 'nowrap';
    const needs = bar.scrollWidth > bar.clientWidth + 2;
    bar.style.flexWrap = '';
    return needs;
  };

  const syncOverflow = () => {
    if (syncing) return;
    syncing = true;
    const wasOpen = open;
    const needs = measureNeedsOverflow();
    if (needs) {
      open = wasOpen;
      applyOverflow(open);
    } else {
      open = false;
      applyExpanded();
    }
    syncing = false;
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.hidden || !bar.classList.contains('controls-bar--overflow')) return;
    setOpen(panel.hidden);
  });

  document.addEventListener('pointerdown', (e) => {
    if (!open || panel.hidden) return;
    const t = e.target;
    if (t instanceof Node && (panel.contains(t) || btn.contains(t))) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open || panel.hidden) return;
    setOpen(false);
    btn.focus();
  });

  let raf = 0;
  const scheduleSync = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(syncOverflow);
  };

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(scheduleSync);
    ro.observe(bar);
  }
  window.addEventListener('resize', scheduleSync);
  syncOverflow();
}

/** Sin scroll en virtual.html; excepción listas en modales/nav. */
const SCROLL_ALLOW_SELECTOR = '.sampler-list, .nav-menu.active, .help-content, .kit-share-content textarea';

function initPageScrollLock() {
  const allowScroll = (target) => target instanceof Element && target.closest(SCROLL_ALLOW_SELECTOR);
  const allowRateDrag = (target) =>
    target instanceof Element &&
    target.closest('#rate-slider, .battery-rate-container, #volume-slider, .battery-volume-container, .kit-audio-controls');

  document.addEventListener('touchmove', (e) => {
    if (allowScroll(e.target) || allowRateDrag(e.target)) return;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('wheel', (e) => {
    if (allowScroll(e.target)) return;
    e.preventDefault();
  }, { passive: false });
}

/**
 * Pad layout — exactly 3 tiers (tokens.css / site-config):
 * mobile ≤767 | tablet 768–1023 | desktop ≥1024
 * Pads always square (1:1). Gutters from CSS vars (--pad-gap / --pad-grid-pad).
 */
let padsLayoutFrame = 0;

/** @typedef {'mobile'|'tablet'|'desktop'} PadViewportTier */

/** Size math only — gap/gridPad come from tokens.css via readPadGutterVars(). */
const PAD_LAYOUT_BY_TIER = {
  mobile: {
    sideInset: 28,
    topInset: 10,
    maxCap: 112,
    minPad: 44,
    volFloor: 72,
    volExtra: 16,
    sizeScale: 1,
    pickLayout: true,
  },
  tablet: {
    sideInset: 40,
    topInset: 12,
    maxCap: 120,
    minPad: 48,
    volFloor: 64,
    volExtra: 18,
    sizeScale: 1,
    pickLayout: false,
  },
  desktop: {
    // Fuller stage: bigger squares, modest margins (not edge-flush)
    sideInset: 32,
    topInset: 10,
    maxCap: 176,
    minPad: 48,
    volFloor: 56,
    volExtra: 12,
    sizeScale: 1,
    pickLayout: false,
  },
};

function getPadViewportTier() {
  const w = window.innerWidth;
  if (w <= NAV_MOBILE_MAX_PX) return 'mobile';
  if (w < BREAKPOINT_DESKTOP_MIN_PX) return 'tablet';
  return 'desktop';
}

/** Sync JS size math with tokens.css --pad-gap / --pad-grid-pad. */
function readPadGutterVars() {
  const cs = getComputedStyle(document.documentElement);
  const gap = parseFloat(cs.getPropertyValue('--pad-gap')) || 8;
  const gridPad = parseFloat(cs.getPropertyValue('--pad-grid-pad')) || 8;
  return { gap, gridPad };
}

function factorPadGridPairs(total) {
  const pairs = [];
  for (let cols = 1; cols <= total; cols++) {
    if (total % cols !== 0) continue;
    pairs.push({ cols, rows: total / cols });
  }
  return pairs;
}

/** Square pad size that fits cols×rows in avail box. */
function padSquareSize(cols, rows, availW, availH, gap, gridPad, maxCap) {
  const sizeW = (availW - (cols - 1) * gap - 2 * gridPad) / cols;
  const sizeH = (availH - (rows - 1) * gap - 2 * gridPad) / rows;
  return Math.min(sizeW, sizeH, maxCap);
}

/**
 * Mobile only: pick cols×rows for square pads.
 * Prefer near-max touch size; if that leaves tall dead space, prefer fewer cols / more rows
 * (e.g. 4×6 or 3×8 over 6×4) so the grid uses availH. Soft fill ≤0.92 keeps modest margins.
 */
function pickResponsivePadLayout(total, availW, availH, gap, gridPad, maxCap, minPad, cfg) {
  const candidates = [];

  for (const { cols, rows } of factorPadGridPairs(total)) {
    if (cols > 8 || rows > 8) continue;
    const size = padSquareSize(cols, rows, availW, availH, gap, gridPad, maxCap);
    if (size < minPad) continue;

    const widthUsed = cols * size + (cols - 1) * gap + 2 * gridPad;
    const heightUsed = rows * size + (rows - 1) * gap + 2 * gridPad;
    candidates.push({
      cols,
      rows,
      size,
      fillW: widthUsed / Math.max(1, availW),
      fillH: heightUsed / Math.max(1, availH),
    });
  }

  if (!candidates.length) return { cols: cfg.cols, rows: cfg.rows };

  const soft = (n) => Math.min(n, 0.92);
  const maxSize = Math.max(...candidates.map((c) => c.size));
  const largest = candidates
    .filter((c) => c.size >= maxSize * 0.98)
    .sort((a, b) => soft(b.fillH) - soft(a.fillH))[0];

  // Viewport portrait (not stage box): wide near-max → open taller pool (6×4→4×6).
  // Stage availH×availW is often landscape after chrome; use window aspect.
  const preferTall = window.innerHeight > window.innerWidth;
  let verticalSlack = soft(largest.fillH) < 0.85;
  if (preferTall && largest.cols > largest.rows) verticalSlack = true;
  // ponytail: 0.70 floor when forcing tall — 4×6 drops below 0.78×maxSize with mid chrome
  const sizeFloor = maxSize * (verticalSlack ? (preferTall && largest.cols > largest.rows ? 0.7 : 0.78) : 0.92);
  const pool = candidates.filter((c) => c.size >= sizeFloor);

  pool.sort((a, b) => {
    if (preferTall) {
      const tallA = a.rows >= a.cols ? 1 : 0;
      const tallB = b.rows >= b.cols ? 1 : 0;
      if (tallA !== tallB) return tallB - tallA;
    }
    if (verticalSlack) {
      const dH = soft(b.fillH) - soft(a.fillH);
      if (Math.abs(dH) > 0.03) return dH;
      const dS = b.size - a.size;
      if (Math.abs(dS) > 1) return dS;
      return b.rows - b.cols - (a.rows - a.cols);
    }
    const dS = b.size - a.size;
    if (Math.abs(dS) > 0.5) return dS;
    return soft(b.fillW) - soft(a.fillW);
  });

  const best = pool[0];
  console.assert(best.cols * best.rows === total);
  return { cols: best.cols, rows: best.rows };
}

function layoutResponsivePads() {
  const view = document.getElementById('pads-view');
  const kitPlay = document.querySelector('.virtual-page .kit-play');
  if (!view || view.classList.contains('hidden') || !kitPlay) return;

  const cfg = gridConfigs[currentGridType] || gridConfigs['3x4'];
  view.style.removeProperty('--pad-cols');
  view.style.removeProperty('--pad-rows');
  view.style.removeProperty('--pad-size');
  view.style.removeProperty('--pad-size-w');
  view.style.removeProperty('--pad-size-h');

  const tier = getPadViewportTier();
  const L = PAD_LAYOUT_BY_TIER[tier];
  const { sideInset, topInset, maxCap, minPad, volFloor, volExtra, sizeScale } = L;
  const { gap, gridPad } = readPadGutterVars();

  const vol = kitPlay.querySelector('.kit-audio-controls') || kitPlay.querySelector('.battery-volume-container');
  const playRect = kitPlay.getBoundingClientRect();
  const volH = Math.max(vol ? vol.offsetHeight : 0, volFloor) + volExtra;
  // Prefer pads-view width (already has CSS gutters); sideInset = fallback only
  const availW = Math.max(60, view.clientWidth > 40 ? view.clientWidth : playRect.width - sideInset);
  const viewH = view.clientHeight;
  const stageBudget = Math.max(0, playRect.height - volH - topInset);
  const availH = viewH > 80
    ? Math.max(60, Math.min(viewH, stageBudget) - gridPad * 2)
    : Math.max(60, stageBudget - gridPad * 2);
  if (availW < 60 || availH < 60) return;

  if (cfg.cols * cfg.rows !== cfg.total) return;

  const { cols: layoutCols, rows: layoutRows } = L.pickLayout
    ? pickResponsivePadLayout(cfg.total, availW, availH, gap, gridPad, maxCap, minPad, cfg)
    : { cols: cfg.cols, rows: cfg.rows };
  if (layoutCols * layoutRows !== cfg.total) return;

  const size = padSquareSize(layoutCols, layoutRows, availW, availH, gap, gridPad, maxCap);
  if (size < minPad) return;

  // ponytail: square only — known ceiling if non-1:1 returns; never reintroduce -w/-h
  console.assert(Number.isFinite(size) && size > 0);

  view.style.setProperty('--pad-cols', String(layoutCols));
  view.style.setProperty('--pad-rows', String(layoutRows));
  view.style.setProperty('--pad-size', `${Math.floor(size * sizeScale)}px`);
}

function scheduleResponsivePadsLayout() {
  cancelAnimationFrame(padsLayoutFrame);
  padsLayoutFrame = requestAnimationFrame(() => {
    padsLayoutFrame = requestAnimationFrame(layoutResponsivePads);
  });
}

function initResponsivePadsLayout() {
  scheduleResponsivePadsLayout();
  const kitPlay = document.querySelector('.virtual-page .kit-play');
  if (kitPlay && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => scheduleResponsivePadsLayout());
    ro.observe(kitPlay);
  }
  window.addEventListener('resize', scheduleResponsivePadsLayout);
}

function initNoteRepeatToggle() {
  const btn = document.getElementById('note-repeat-btn');
  const label = document.getElementById('note-repeat-btn-label');
  const rateSlider = document.getElementById('note-repeat-rate');
  const rateLabel = document.getElementById('note-repeat-rate-label');
  if (!btn) return undefined;

  const syncRateUi = () => {
    const ms = noteRepeatIntervalMs();
    if (rateSlider) {
      rateSlider.value = String(noteRepeatMsToSlider(ms));
      rateSlider.setAttribute('aria-valuetext', noteRepeatRateLabel(ms));
    }
    if (rateLabel) rateLabel.textContent = noteRepeatRateLabel(ms);
  };

  const apply = (on) => {
    setNoteRepeatEnabled(on);
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (label) label.textContent = on ? 'Activo' : 'Apagado';
    document.querySelector('.note-repeat-rate')?.classList.toggle('note-repeat-rate--on', on);
    btn.title = on
      ? 'Redoble activo (Note Repeat): mantén tecla o pad para repetir el sonido. Pulsa otra vez para volver a one-shot.'
      : 'Activa el redoble: al sostener tecla o pad, el sonido repite en ráfaga — como Note Repeat en el MPC. Apagado = un golpe por pulsación.';
  };

  if (rateSlider) {
    rateSlider.addEventListener('input', () => {
      const ms = noteRepeatSliderToMs(rateSlider.value);
      setNoteRepeatIntervalMs(ms);
      syncRateUi();
    });
  }

  syncRateUi();
  apply(isNoteRepeatEnabled());
  btn.addEventListener('click', () => apply(!isNoteRepeatEnabled()));
  return apply;
}

function readPadsSoundsFromStorage(gridType) {
  try {
    const raw = localStorage.getItem(`pianoChampeteroPads_${gridType}`);
    if (raw === null) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function emptyPadsByGrid() {
  const out = {};
  for (const gt of PAD_GRID_SIZE_ORDER) {
    out[gt] = Array(gridConfigs[gt].total).fill('');
  }
  return out;
}

function emptyPadKeysByGrid() {
  const out = {};
  for (const gt of PAD_GRID_SIZE_ORDER) out[gt] = {};
  return out;
}

function defaultPadKeysCanonical(gridType) {
  const total = gridConfigs[gridType]?.total || 0;
  const map = buildPadKeyIndexMap(total);
  normalizePlayablePadKeyMap(map, total);
  const canon = Object.create(null);
  for (let p = 0; p < total; p++) {
    const c = findCanonicalCodeForPad(map, p);
    if (c) canon[c] = p;
  }
  return canon;
}

/** Kit 1 factory keys — same for default kit and «Aleatorio» (only sounds differ). */
function factoryDefaultKeysPayload() {
  return {
    keyMap: normalizeKeyMap(keyToTomIdDefaults),
    padKeys: Object.fromEntries(
      PAD_GRID_SIZE_ORDER.map((gt) => [gt, defaultPadKeysCanonical(gt)]),
    ),
  };
}

function capturePadKeysForGrid(gridType) {
  const total = gridConfigs[gridType]?.total || 0;
  if (gridType === currentGridType) {
    const canon = Object.create(null);
    for (let p = 0; p < total; p++) {
      const c = findCanonicalCodeForPad(keyToPadIndex, p);
      if (c) canon[c] = p;
    }
    return canon;
  }
  const saved = loadPadKeysSavedObject(gridType);
  if (saved !== null) return { ...saved };
  return defaultPadKeysCanonical(gridType);
}

function capturePadsForGrid(gridType) {
  if (gridType === currentGridType) {
    return padsViewState.map((s) => (s ? s.replace(/\\/g, '/') : ''));
  }
  const stored = readPadsSoundsFromStorage(gridType);
  if (stored) return stored.map((s) => (s ? String(s).replace(/\\/g, '/') : ''));
  return loadPadsViewSounds(gridType).map((s) => (s ? s.replace(/\\/g, '/') : ''));
}

function restoreDefaultPadsAndKeys() {
  const { padKeys } = factoryDefaultKeysPayload();
  for (const gt of PAD_GRID_SIZE_ORDER) {
    savePadsViewSounds(gt, getDefaultPadsSounds(gridConfigs[gt].total));
  }
  applyKitPadsAndKeys({ padKeys });
}

function applyKitPadsAndKeys(preset) {
  if (preset.gridType && gridConfigs[preset.gridType]) {
    currentGridType = preset.gridType;
    localStorage.setItem('pianoChampeteroGridType', currentGridType);
  }

  if (preset.pads) {
    for (const gt of PAD_GRID_SIZE_ORDER) {
      if (!Object.prototype.hasOwnProperty.call(preset.pads, gt)) continue;
      const total = gridConfigs[gt].total;
      const sounds = preset.pads[gt].slice(0, total);
      while (sounds.length < total) sounds.push('');
      savePadsViewSounds(gt, sounds);
    }
  }

  if (preset.padKeys) {
    for (const gt of PAD_GRID_SIZE_ORDER) {
      if (!Object.prototype.hasOwnProperty.call(preset.padKeys, gt)) continue;
      try {
        localStorage.setItem(padKeysStorageKey(gt), JSON.stringify(preset.padKeys[gt] || {}));
      } catch { /* ignore */ }
    }
  }

  padsViewState = loadPadsViewSounds(currentGridType);
  rebuildPadKeyIndexMap();
  Object.keys(padsViewBuffers).forEach((k) => delete padsViewBuffers[k]);
}

function captureBatteryState() {
  const pads = {};
  const padKeys = {};
  for (const gt of PAD_GRID_SIZE_ORDER) {
    pads[gt] = capturePadsForGrid(gt);
    padKeys[gt] = capturePadKeysForGrid(gt);
  }

  const samplers = {};
  Object.keys(tomAudioMap).forEach((k) => {
    samplers[k] = tomAudioMap[k] ? tomAudioMap[k].replace(/\\/g, '/') : '';
  });
  return {
    samplers,
    keyMap: { ...keyToTomId },
    volume: currentVolume,
    gridType: currentGridType,
    pads,
    padKeys,
  };
}

function syncActiveKitIfAny() {
  syncActiveKit(captureBatteryState);
}

function getBatteryTemplate(kind) {
  const tomIds = Object.keys(tomSamplersDefaults);
  const factoryKeys = factoryDefaultKeysPayload();
  if (kind === 'empty') {
    return {
      blank: true,
      samplers: Object.fromEntries(tomIds.map((k) => [k, ''])),
      keyMap: {},
      volume: DEFAULT_VOLUME,
      gridType: currentGridType,
      pads: emptyPadsByGrid(),
      padKeys: emptyPadKeysByGrid(),
    };
  }
  if (kind === 'random') {
    const pool = [...samplerList];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const samplers = {};
    tomIds.forEach((id, i) => {
      samplers[id] = pool[i % pool.length] || '';
    });
    const pads = {};
    let poolIdx = 0;
    for (const gt of PAD_GRID_SIZE_ORDER) {
      const total = gridConfigs[gt].total;
      pads[gt] = Array.from({ length: total }, () => {
        const file = pool[poolIdx % pool.length] || '';
        poolIdx += 1;
        return file;
      });
    }
    return {
      samplers,
      ...factoryKeys,
      volume: DEFAULT_VOLUME,
      gridType: currentGridType,
      pads,
    };
  }
  return {
    samplers: { ...tomSamplersDefaults },
    ...factoryKeys,
    volume: DEFAULT_VOLUME,
    gridType: currentGridType,
    pads: Object.fromEntries(PAD_GRID_SIZE_ORDER.map((gt) => {
      const total = gridConfigs[gt].total;
      return [gt, getDefaultPadsSounds(total, tomSamplersDefaults)];
    })),
  };
}

function kitNeedsFactoryRestore(kit) {
  if (!isDefaultKit(kit)) return false;
  if (kit.blank) return true;
  const tomIds = Object.keys(tomSamplersDefaults);
  if (tomIds.every((id) => !kit.samplers?.[id])) return true;
  if (!kit.keyMap || Object.keys(kit.keyMap).length === 0) return true;
  return false;
}

function normalizeKitForApply(kit) {
  if (!kitNeedsFactoryRestore(kit)) return kit;
  const factory = getBatteryTemplate();
  const { blank, ...rest } = kit;
  return { ...rest, ...factory };
}

async function applyStoredActiveKit() {
  const id = getActiveKitId();
  if (!id) return;
  const raw = getBatteryKit(id);
  if (!raw) return;
  const kit = normalizeKitForApply(raw);
  if (kitNeedsFactoryRestore(raw)) {
    const { blank, ...toSave } = kit;
    updateBatteryKit(id, toSave);
  }
  await applyBatteryPreset(kit);
}

async function applyBatteryPreset(preset) {
  applyingBlankPreset = preset.blank === true;
  try {
    if (preset.samplers) {
      Object.keys(tomAudioMap).forEach((k) => {
        tomAudioMap[k] = Object.prototype.hasOwnProperty.call(preset.samplers, k)
          ? (preset.samplers[k] || '')
          : '';
      });
      saveSamplers();
    }
    if (preset.blank || preset.keyMap) {
      keyToTomId = normalizeKeyMap(preset.keyMap || {});
      saveKeyMapping(keyToTomId);
    } else {
      keyToTomId = normalizeKeyMap(keyToTomIdDefaults);
      saveKeyMapping(keyToTomId);
    }
    if (typeof preset.volume === 'number' && Number.isFinite(preset.volume)) {
      currentVolume = Math.min(1, Math.max(0, preset.volume));
      setMasterVolume(currentVolume);
      saveStoredVolume(currentVolume);
      const sliderVolumen = document.getElementById('volume-slider');
      const labelPorcentaje = document.getElementById('volume-percent');
      if (sliderVolumen) sliderVolumen.value = String(currentVolume);
      if (labelPorcentaje) labelPorcentaje.textContent = `${Math.round(currentVolume * 100)}%`;
    }
    if (preset.pads || preset.padKeys || preset.gridType) {
      applyKitPadsAndKeys(preset);
    } else if (!preset.blank) {
      restoreDefaultPadsAndKeys();
    }
    await preloadAllSamplers();
    actualizarEtiquetasTeclas(keyToTomId);
    actualizarNombresPads();
    if (currentViewMode === 'pads') {
      generateGridOptions();
      generatePadsView();
    }
  } finally {
    applyingBlankPreset = false;
  }
}

async function applyImportedKit(snapshot) {
  persistKitSnapshot(snapshot);

  if (snapshot.s && typeof snapshot.s === 'object') {
    Object.keys(tomAudioMap).forEach((tomId) => {
      tomAudioMap[tomId] = snapshot.s[tomId] ?? tomSamplersDefaults[tomId];
    });
    saveSamplers();
  }

  const savedKeys = loadKeyMapping();
  keyToTomId = savedKeys ? normalizeKeyMap(savedKeys) : normalizeKeyMap(keyToTomIdDefaults);

  currentGridType = localStorage.getItem('pianoChampeteroGridType') || '3x4';
  if (!gridConfigs[currentGridType]) currentGridType = '3x4';

  padsViewState = loadPadsViewSounds(currentGridType);
  rebuildPadKeyIndexMap();

  currentVolume = readStoredVolume();
  setMasterVolume(currentVolume);

  await preloadAllSamplers();
  actualizarEtiquetasTeclas(keyToTomId);
  actualizarNombresPads();

  const view = localStorage.getItem('pianoChampeteroViewMode') || 'bateria';
  switchView('pads');

  const noteRepeatBtn = document.getElementById('note-repeat-btn');
  const noteRepeatLabel = document.getElementById('note-repeat-btn-label');
  const nrOn = isNoteRepeatEnabled();
  if (noteRepeatBtn) {
    noteRepeatBtn.classList.toggle('active', nrOn);
    noteRepeatBtn.setAttribute('aria-pressed', nrOn ? 'true' : 'false');
  }
  if (noteRepeatLabel) noteRepeatLabel.textContent = nrOn ? 'Activo' : 'Apagado';
}

function initKitConfigShare(noteRepeatApply) {
  const nameInput = document.getElementById('kit-share-name');
  const exportField = document.getElementById('kit-share-payload');
  const importField = document.getElementById('kit-import-payload');
  const statusEl = document.getElementById('kit-import-status');
  const copyBtn = document.getElementById('kit-share-copy-btn');
  const whatsappBtn = document.getElementById('kit-share-whatsapp-btn');
  const importBtn = document.getElementById('kit-import-btn');

  if (!exportField || !importField) return;

  const setStatus = (text, isError = false) => {
    if (!statusEl) return;
    statusEl.hidden = !text;
    statusEl.textContent = text;
    statusEl.classList.toggle('kit-import-status--error', isError);
  };

  const refreshExportPayload = () => {
    const snapshot = collectKitSnapshot(nameInput?.value || '');
    const code = encodeKitSnapshot(snapshot);
    exportField.value = code;
    exportField.dataset.shareUrl = buildKitShareUrl(code);
  };

  if (nameInput) nameInput.addEventListener('input', refreshExportPayload);

  initModal('modal-kit-share', {
    openBtnId: 'share-kit-btn',
    closeBtnId: 'kit-share-close-btn',
    focusOnOpen: false,
    onOpen: () => {
      setStatus('');
      refreshExportPayload();
    },
  });

  copyBtn?.addEventListener('click', async () => {
    refreshExportPayload();
    const text = exportField.value;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Código copiado. Pegalo en WhatsApp o en Importar.');
    } catch {
      exportField.focus();
      exportField.select();
      setStatus('Seleccioná el código y copialo manualmente (Ctrl+C).');
    }
  });

  whatsappBtn?.addEventListener('click', () => {
    refreshExportPayload();
    const snapshot = collectKitSnapshot(nameInput?.value || '');
    const code = exportField.value;
    const msg = buildShareMessage(snapshot, code);
    window.open(buildWhatsAppSendUrl(msg), '_blank', 'noopener,noreferrer');
  });

  importBtn?.addEventListener('click', async () => {
    setStatus('');
    try {
      const snapshot = decodeKitToken(importField.value);
      await applyImportedKit(snapshot);
      if (noteRepeatApply) noteRepeatApply(isNoteRepeatEnabled());
      const label = snapshot.n ? `"${snapshot.n}"` : 'Kit importado';
      setStatus(`${label} listo. ¡A tocar!`);
      importField.value = '';
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'No se pudo importar.', true);
    }
  });

  const urlToken = kitTokenFromPageUrl();
  if (urlToken) {
    importField.value = urlToken;
    setStatus('Enlace con kit detectado — pulsa Importar para cargarlo.');
    const modal = document.getElementById('modal-kit-share');
    if (modal) modal.style.display = 'flex';
    history.replaceState({}, '', location.pathname);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const isMainPage = document.getElementById('pads-grid') !== null;
  await initSiteChrome();
  const navVirtual = document.getElementById('nav-virtual');
  if (navVirtual) navVirtual.classList.add('active');
  setYearFooter();
  resumeOnUserGesture();

  if (!isMainPage) return;

  initAudioVisualizer({ analyser });
  initAudioWarmup();
  initPageScrollLock();
  initResponsivePadsLayout();
  const applyNoteRepeat = initNoteRepeatToggle();
  initKitConfigShare(applyNoteRepeat);
  const batteryPresets = initBatteryPresets({
    captureState: captureBatteryState,
    applyPreset: applyBatteryPreset,
    getTemplate: getBatteryTemplate,
    getFactoryKeys: factoryDefaultKeysPayload,
    enterEditMode: () => {
      if (!modoEdicion) document.getElementById('edit-btn')?.click();
    },
  });
  batteryPresetsCtl = batteryPresets;
  refreshBatteryPresets = batteryPresets?.refresh ?? (() => {});
  await applyStoredActiveKit();

  /** @type {'audio' | 'loop' | null} */
  let sidebarMode = null;
  const sidebarEl = document.getElementById('kit-play-sidebar');
  let refreshAudioSidebar = () => {};
  let refreshLoopSidebar = () => {};
  const setSidebarMode = (mode) => {
    sidebarMode = mode;
    if (sidebarEl) {
      if (mode) sidebarEl.dataset.sidebarMode = mode;
      else delete sidebarEl.dataset.sidebarMode;
    }
    refreshAudioSidebar();
    refreshLoopSidebar();
  };
  const getSidebarMode = () => sidebarMode;
  const sidebarOpts = {
    getSidebarMode,
    registerRefresh: (fn) => { refreshAudioSidebar = fn; },
  };
  const loopSidebarOpts = {
    getSidebarMode,
    registerRefresh: (fn) => { refreshLoopSidebar = fn; },
  };

  const sessionRecorder = initSessionRecorder({
    audioCtx,
    getMasterGain,
    recordBtn: document.getElementById('session-record-btn'),
    recordLabel: document.getElementById('session-record-label'),
    panel: document.getElementById('session-recordings-panel'),
    sidebarEl,
    listEl: document.getElementById('session-recordings-list'),
    statusEl: document.getElementById('session-record-status'),
    onBeforeRecord: stopPatternLoop,
    onActivate: () => setSidebarMode('audio'),
    ...sidebarOpts,
  });

  initPatternLoops({
    recordBtn: document.getElementById('pattern-loop-btn'),
    recordLabel: document.getElementById('pattern-loop-label'),
    panel: document.getElementById('pattern-loops-panel'),
    listEl: document.getElementById('pattern-loops-list'),
    statusEl: document.getElementById('pattern-loop-status'),
    onBeforeCapture: () => sessionRecorder?.stopIfRecording?.(),
    onActivate: () => setSidebarMode('loop'),
    ...loopSidebarOpts,
    getContext: () => ({
      view: 'pads',
      gridType: currentGridType,
    }),
    ensureContext: async (pattern) => {
      switchView('pads');
      if (pattern.gridType && pattern.gridType !== currentGridType) changeGrid(pattern.gridType);
    },
    playHit: (hit) => {
      if (hit.kind === 'tom') activateTomSampler(hit.id, { flash: true });
      else activatePadSound(hit.id, { flash: true });
    },
  });

  const hasAudio = listSessionRecordings().length > 0;
  const hasLoops = listPatternLoops().length > 0;
  if (hasLoops && !hasAudio) setSidebarMode('loop');
  else if (hasAudio && !hasLoops) setSidebarMode('audio');
  else if (hasLoops && hasAudio) setSidebarMode('loop');

  // Preload agresivo de samplers (applyStoredActiveKit ya aplicó kit activo + teclas)
  await preloadAllSamplers();
  actualizarEtiquetasTeclas(keyToTomId);
  actualizarNombresPads();

  const sliderVolumen = document.getElementById('volume-slider');
  const labelPorcentaje = document.getElementById('volume-percent');
  if (sliderVolumen) {
    const actualizarLabel = v => labelPorcentaje && (labelPorcentaje.textContent = Math.round(v * 100) + '%');
    sliderVolumen.value = String(currentVolume);
    if (labelPorcentaje) actualizarLabel(currentVolume);
    sliderVolumen.addEventListener('input', e => {
      currentVolume = +e.target.value;
      setMasterVolume(currentVolume);
      saveStoredVolume(currentVolume);
      if (labelPorcentaje) actualizarLabel(currentVolume);
      syncActiveKitIfAny();
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

  const sliderRate = document.getElementById('rate-slider');
  const labelRate = document.getElementById('rate-percent');
  const rateFixedCheck = document.getElementById('rate-fixed');
  const rateSurface = sliderRate?.closest('.battery-rate-container') || sliderRate;
  if (sliderRate && rateSurface) {
    // Mobile-first: hold + drag sideways on the whole control until finger up.
    let ratePointerId = null;

    const syncRateUi = (rate) => {
      sliderRate.value = String(sliderFromPlaybackRate(rate));
      if (labelRate) labelRate.textContent = formatPlaybackRate(rate);
    };
    const snapRateToCenter = () => {
      setPlaybackRate(DEFAULT_PLAYBACK_RATE, { persist: true });
      syncRateUi(DEFAULT_PLAYBACK_RATE);
    };
    const rateFromClientX = (clientX) => {
      const rect = sliderRate.getBoundingClientRect();
      if (rect.width <= 0) return 50;
      const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return Math.round(t * 100);
    };
    const applyRateSliderValue = (sliderVal) => {
      setPlaybackRate(playbackRateFromSlider(sliderVal), { persist: playbackRateFixed });
      sliderRate.value = String(sliderVal);
      if (labelRate) labelRate.textContent = formatPlaybackRate(currentPlaybackRate);
    };

    if (rateFixedCheck) rateFixedCheck.checked = playbackRateFixed;
    if (playbackRateFixed) {
      syncRateUi(currentPlaybackRate);
    } else {
      currentPlaybackRate = DEFAULT_PLAYBACK_RATE;
      syncRateUi(DEFAULT_PLAYBACK_RATE);
      saveStoredPlaybackRate(DEFAULT_PLAYBACK_RATE);
    }

    rateSurface.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest('.rate-fixed-label')) return;
      e.preventDefault();
      ratePointerId = e.pointerId;
      try { rateSurface.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      applyRateSliderValue(rateFromClientX(e.clientX));
    });
    rateSurface.addEventListener('pointermove', (e) => {
      if (ratePointerId !== e.pointerId) return;
      e.preventDefault();
      applyRateSliderValue(rateFromClientX(e.clientX));
    });
    const endRateDrag = (e) => {
      if (ratePointerId == null) return;
      if (e.pointerId != null && e.pointerId !== ratePointerId) return;
      ratePointerId = null;
      try { rateSurface.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (!playbackRateFixed) snapRateToCenter();
    };
    rateSurface.addEventListener('pointerup', endRateDrag);
    rateSurface.addEventListener('pointercancel', endRateDrag);
    window.addEventListener('blur', () => {
      if (ratePointerId == null) return;
      ratePointerId = null;
      if (!playbackRateFixed) snapRateToCenter();
    });

    // Keyboard / a11y when not finger-dragging.
    sliderRate.addEventListener('input', (e) => {
      if (ratePointerId != null) return;
      applyRateSliderValue(Number(e.target.value));
    });

    rateFixedCheck?.addEventListener('change', () => {
      playbackRateFixed = !!rateFixedCheck.checked;
      saveStoredRateFixed(playbackRateFixed);
      if (playbackRateFixed) {
        saveStoredPlaybackRate(currentPlaybackRate);
      } else {
        snapRateToCenter();
      }
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
    getVolume: () => currentVolume,
    getPlaybackRate: () => currentPlaybackRate,
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
    const wasEditing = modoEdicion;
    modoEdicion = !modoEdicion;
    if (wasEditing) {
      persistPadKeysForCurrentGrid();
      batteryPresetsCtl?.onEditExit?.();
    } else batteryPresetsCtl?.onEditEnter?.();
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
      actualizarNombresPads();
      keysHeldForRepeat.clear();
      stopAllNoteRepeat();
      stopPatternLoop();
      if (isPatternCapturing()) stopPatternCapture();
    }
    if (!modoEdicion) cerrarModal();
    refreshBatteryPresets();
  });

  // Pads-only — no battery/pads view toggle
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

  switchView('pads');

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
        e.preventDefault();
        const target = { kind: 'tom', id: tomId };
        activateTomSampler(tomId);
        beginTomNoteRepeat(tomId);
        beginPlayGlide(e, target);
      });
    }
  });

  function isEditableKeyboardTarget(target) {
    if (!(target instanceof Element)) return false;
    const field = target.closest('input, textarea, select, [contenteditable="true"]');
    if (!field) return false;
    if (field instanceof HTMLInputElement) {
      const type = (field.type || 'text').toLowerCase();
      return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file'].includes(type);
    }
    return true;
  }

  const PLAY_KEYBOARD_BLOCK_MODALS = ['modal-edit', 'modal-kit-share', 'modal-help', 'modal-confirm-reset', 'modal-pc-audio-guide'];

  function shouldBlockPlayKeyboard(e) {
    if (modoEdicion) return true;
    if (isEditableKeyboardTarget(e.target)) return true;
    return PLAY_KEYBOARD_BLOCK_MODALS.some(isModalOpen);
  }

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
    if (shouldBlockPlayKeyboard(e)) return;
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
    if (shouldBlockPlayKeyboard(e)) return;
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
        syncActiveKitIfAny();
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
        syncActiveKitIfAny();
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
  initMoreControls();
  initPlayGlide();
});