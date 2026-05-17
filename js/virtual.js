// js/virtual.js — lógica de la batería para virtual.html
// OPTIMIZADO: Latencia mínima, preload agresivo, sin requestAnimationFrame en play
import { initSiteChrome, setYearFooter, resumeOnUserGesture } from './common.js';
import { AUDIO_UI } from './site-config.js';
import { initModal } from './modal-utils.js';
import { DEFAULT_PAD_KEY_CHAR_ORDER, BATTERY_DEFAULT_PAD_CHARS, buildPadKeyIndexMap, resolvePadIndexFromKeyboard } from './pad-keyboard.js';

// AudioContext con latencia mínima
export const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
  latencyHint: 'interactive',
  sampleRate: 48000
});

const HIT_FLASH_MS = AUDIO_UI.hitFlashMs;

export const tomSamplersDefaults = {
  'tom-1': 'D (2).wav',
  'tom-2': 'F4.wav',
  'tom-3': 'Pitico.wav',
  'tom-4': 'SKTAC.WAV',
  'tom-5': 'Y.wav',
  'tom-6': 'Lazer.wav',
  'tom-7': 'perro bajo.WAV',
  'tom-8': 'SK2.WAV',
  'tom-9': 'Smar 1.wav'
};

export const samplerList = [
  '00COMO DD14.wav', '00DEEJAY.mp3', '00EFECTO SANTOYA-TRA.wav', '00EXELENT.wav', '00FOUR-1.wav',
  '00PERRO-1.wav', '00Yeut01 Sk.wav', '00ctm6.wav', '00estrellitt.wav', '00piii Samples.wav',
  '00uio el original.wav', '11-BALETA (1).wav', '142.wav', '159.wav', '16.wav', '17.wav', '18.wav',
  '20.wav', '20_2.wav', '217.wav', '555.wav', '63_SNARE.wav', 'BAJO CHAMPETA.wav', 'Bateria 1.wav',
  'Bateria 4.wav', 'Bateria 8.wav', 'CAS.wav', 'CCC.wav', 'CM perreo 4x4 (11).wav',
  'CM perreo 4x4 (12).wav', 'C_Kick.wav', 'D (2).wav', 'DD50 SANRE.wav', 'DD50 SNARE5.wav', 'EEEE.wav',
  'Effect 16.wav', 'Effect 2.wav', 'Effect 9.wav', 'F4.wav', 'GAVIOTA dd14.wav', 'Golpe SK5.wav',
  'HEY VACANO.wav', 'Lazer.wav', 'Leon.wav', 'OU3.wav', 'PITICO CARNAVAL.wav', 'PITICO CARNAVAL2.wav',
  'PITICO CARNAVAL3.wav', 'PITO3-D.wav', 'PITO4-.wav', 'PON1.wav', 'PS 555 ORIGINAL.wav',
  'Palmas Criollas.wav', 'Pitico.wav', 'Platillo.wav', 'Ponte Ready.wav', 'Rudeboy_AyAy.wav',
  'SK1.WAV', 'SK2.WAV', 'SKTAC.WAV', 'SKTUN.WAV', 'SN DD14.wav', 'SNARE 7.wav', 'SNARE8.wav',
  'Sampler Yeah.mp3', 'Smar 1.wav', 'T10  Samples.wav', 'T9  Samples.wav', 'TAMOS fUECTE COMO RAMBO .wav',
  'TE LO REPITO.mp3', 'TIMBAL 2 (ELIEL).wav', 'TUS.wav', 'Todo el mundo espelucao.wav', 'Treyban1.wav',
  'VACILE RAPIDO (3).wav', 'VIIP.wav', 'Vesatile_Sound_Phrase_PL.wav', 'WARA2.wav', 'Wuaaa.wav', 'Y.wav',
  'canario.wav', 'hipo.wav', 'laser profeta 1.wav', 'laser profeta 2.wav', 'mono-1.wav', 'mono-3.wav',
  'perro bajo.WAV', 'pimpollo CENCERRO.wav', 'pitico medio.wav', 'sk5 -dog 1.wav', 'sk5 -dog 17.wav',
  'sk5 -lazer.wav', 'sk5 -llion.wav', 'snare (100).wav'
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
export let currentVolume = 0.5;
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
  const onlyName = {};
  Object.keys(tomAudioMap).forEach(k => {
    onlyName[k] = tomAudioMap[k] ? tomAudioMap[k].split('/').pop() : '';
  });
  try { localStorage.setItem('pianoChampeteroSamplers', JSON.stringify(onlyName)); } catch {}
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
  samplersDisponibles = samplerList;
  const availableFiles = new Map(samplersDisponibles.map(f => [f.toLowerCase(), f]));
  Object.keys(tomAudioMap).forEach(tomId => {
    let name = tomAudioMap[tomId] ? tomAudioMap[tomId].split('/').pop() : '';
    if (!name) { tomAudioMap[tomId] = tomSamplersDefaults[tomId]; return; }
    const realName = availableFiles.get(name.toLowerCase());
    if (realName) tomAudioMap[tomId] = realName;
  });
}

// Carga un sampler con cache global (evita re-fetch)
export async function loadSamplerBuffer(url) {
  if (globalSamplerCache[url]) return globalSamplerCache[url];
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = await audioCtx.decodeAudioData(arrayBuffer);
  globalSamplerCache[url] = buffer;
  return buffer;
}

// Preload agresivo: carga TODOS los samplers usados en paralelo
export async function preloadAllSamplers() {
  await loadAvailableSamplers();
  const uniqueFiles = new Set(Object.values(tomAudioMap).filter(Boolean));
  const loadPromises = Array.from(uniqueFiles).map(async (fileName) => {
    const url = 'samplers/' + fileName;
    try { tomSamplerBuffers[fileName] = await loadSamplerBuffer(url); } catch { tomSamplerBuffers[fileName] = null; }
  });
  await Promise.all(loadPromises);
}

// Preload de samplers específicos por nombre de archivo (reutiliza cache)
async function preloadSamplerByName(fileName) {
  if (!fileName) return null;
  const url = 'samplers/' + fileName;
  try { return await loadSamplerBuffer(url); } catch { return null; }
}

// PLAY OPTIMIZADO: Sin requestAnimationFrame, start(0) directo
export function playTomSampler(tomId) {
  const fileName = tomAudioMap[tomId];
  if (!fileName) return;
  const buffer = tomSamplerBuffers[fileName] || globalSamplerCache['samplers/' + fileName];
  if (!buffer) return;
  const slider = document.getElementById('volume-slider');
  const volume = slider ? +slider.value : currentVolume;
  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;
  source.buffer = buffer;
  source.connect(gainNode).connect(audioCtx.destination);
  source.start(0); // start(0) = inmediato, sin delay
}

// ACTIVAR TOM: Resume audio context si es necesario, luego play directo
export async function activateTomSampler(tomId) {
  const button = document.getElementById(tomId);
  if (!button) return;
  button.classList.add('active');
  // Resume el audio context si está suspendido, luego toca inmediatamente
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  playTomSampler(tomId);
  setTimeout(() => button.classList.remove('active'), HIT_FLASH_MS);
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

// PLAY PAD OPTIMIZADO: Sin requestAnimationFrame
export function playPadSound(index) {
  const buffer = padsViewBuffers[index];
  if (!buffer) return;
  const slider = document.getElementById('volume-slider');
  const volume = slider ? +slider.value : currentVolume;
  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;
  source.buffer = buffer;
  source.connect(gainNode).connect(audioCtx.destination);
  source.start(0); // inmediato
}

// ACTIVAR PAD: Resume si es necesario, luego play directo
export async function activatePadSound(index) {
  const padsGrid = document.getElementById('pads-grid');
  if (!padsGrid) return;
  const padButton = padsGrid.children[index];
  if (!padButton) return;
  padButton.classList.add('active');
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  playPadSound(index);
  setTimeout(() => padButton.classList.remove('active'), HIT_FLASH_MS);
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

    pad.addEventListener('click', async () => {
      if (modoEdicion) {
        if (openPadEditModalRef) openPadEditModalRef(i);
        return;
      }
      await activatePadSound(i);
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

document.addEventListener('DOMContentLoaded', async () => {
  const isMainPage = document.getElementById('tom-1') !== null;
  await initSiteChrome();
  const navVirtual = document.getElementById('nav-virtual');
  if (navVirtual) navVirtual.classList.add('active');
  setYearFooter();
  resumeOnUserGesture();

  if (!isMainPage) return;

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
    if (labelPorcentaje) actualizarLabel(sliderVolumen.value);
    sliderVolumen.addEventListener('input', e => { _currentVolume = +e.target.value; if (labelPorcentaje) actualizarLabel(_currentVolume); });
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
  const listaSamplers = document.getElementById('sampler-list');
  const tabSampler = document.getElementById('tab-sampler');
  const tabKey = document.getElementById('tab-key');
  const keyInput = document.getElementById('new-key-input');
  const saveBtn = document.getElementById('save-edit-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  const tabs = modal ? modal.querySelectorAll('.modal-tab') : [];

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
    lastCapturedCode = null;
    switchTab('sampler');
    if (!modal || !listaSamplers) return;
    samplerSeleccionado = null;
    listaSamplers.innerHTML = '';
    const currentFile = tomAudioMap[boton.id] || '';
    samplerList.forEach(nombreArchivo => {
      const li = document.createElement('li');
      li.textContent = nombreArchivo.replace(/\.[^.]+$/, '');
      li.title = nombreArchivo;
      li.className = 'sampler-item';
      li.tabIndex = 0;
      li.addEventListener('click', async () => {
        document.querySelectorAll('.sampler-item').forEach(el => el.classList.remove('selected'));
        li.classList.add('selected');
        samplerSeleccionado = nombreArchivo;
        if (window._previewSource && typeof window._previewSource.stop === 'function') {
          try { window._previewSource.stop(); } catch {}
        }
        try {
          const path = 'samplers/' + nombreArchivo;
          if (audioCtx.state !== 'running') await audioCtx.resume();
          const buffer = await loadSamplerBuffer(path);
          const source = audioCtx.createBufferSource();
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = _currentVolume;
          source.buffer = buffer;
          source.connect(gainNode).connect(audioCtx.destination);
          source.start(0);
          window._previewSource = source;
        } catch (e) { /* ignore preview errors */ }
      });
      li.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') li.click(); });
      if (currentFile.toLowerCase() === nombreArchivo.toLowerCase()) {
        li.classList.add('selected'); samplerSeleccionado = nombreArchivo;
      }
      listaSamplers.appendChild(li);
    });
    if (keyInput) keyInput.value = '';
    modal.style.display = 'flex';
  }

  function cerrarModal() {
    if (modal) modal.style.display = 'none';
    if (window._previewSource && typeof window._previewSource.stop === 'function') {
      try { window._previewSource.stop(); } catch {}
    }
    tomSeleccionado = null;
    samplerSeleccionado = null;
  }

  if (editBtn) editBtn.addEventListener('click', () => {
    modoEdicion = !modoEdicion;
    editBtn.innerHTML = modoEdicion ? '<i class="fa-solid fa-check"></i> Listo' : '<i class="fa-solid fa-pencil"></i> Editar';
    editBtn.classList.toggle('edit-mode-active', modoEdicion);
    document.body.classList.toggle('edit-mode', modoEdicion);
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
    padSamplerSeleccionado = null;
    lastCapturedCode = null;
    switchTab('sampler');
    if (!modal || !listaSamplers) return;
    listaSamplers.innerHTML = '';
    const currentFile = padsViewState[padIndex] || '';
    samplerList.forEach(nombreArchivo => {
      const li = document.createElement('li');
      li.textContent = nombreArchivo.replace(/\.[^.]+$/, '');
      li.title = nombreArchivo;
      li.className = 'sampler-item';
      li.tabIndex = 0;
      li.addEventListener('click', async () => {
        document.querySelectorAll('.sampler-item').forEach(el => el.classList.remove('selected'));
        li.classList.add('selected');
        padSamplerSeleccionado = nombreArchivo;
        if (window._previewSource && typeof window._previewSource.stop === 'function') {
          try { window._previewSource.stop(); } catch {}
        }
        try {
          const path = 'samplers/' + nombreArchivo;
          if (audioCtx.state !== 'running') await audioCtx.resume();
          const buffer = await loadSamplerBuffer(path);
          const source = audioCtx.createBufferSource();
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = _currentVolume;
          source.buffer = buffer;
          source.connect(gainNode).connect(audioCtx.destination);
          source.start(0);
          window._previewSource = source;
        } catch {}
      });
      li.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') li.click(); });
      if (currentFile.toLowerCase() === nombreArchivo.toLowerCase()) {
        li.classList.add('selected');
        padSamplerSeleccionado = nombreArchivo;
      }
      listaSamplers.appendChild(li);
    });
    if (modal) modal.style.display = 'flex';
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
        const items = listaSamplers ? Array.from(listaSamplers.querySelectorAll('.sampler-item')) : [];
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
    if (boton) boton.addEventListener('click', async e => {
      if (modoEdicion) {
        e.stopPropagation(); e.preventDefault();
        abrirModal(boton);
        return;
      }
      await activateTomSampler(tomId);
    });
  });

  document.addEventListener('keydown', async e => {
    if (modal && modal.style.display === 'flex') return;
    if (modoEdicion) return;
    const code = e.code || '';
    if (!e.key && !code) return;
    const inferredKey = (/^[0-9]$/.test(e.key)) ? ('Digit' + e.key) : ('Key' + (e.key || '').toUpperCase());

    if (currentViewMode === 'pads') {
      const padIndex = resolvePadIndexFromKeyboard(e, keyToPadIndex);
      if (padIndex !== undefined) { e.preventDefault(); await activatePadSound(padIndex); }
    } else {
      const tomId = keyToTomId[code] || keyToTomId[inferredKey] || keyToTomId[(e.key || '').toLowerCase()];
      if (tomId) { e.preventDefault(); await activateTomSampler(tomId); }
    }
  }, true);

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

  const editModal = initModal('modal-edit', {
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
          try {
            tomSamplerBuffers[tomId] = await loadSamplerBuffer('samplers/' + samplerSeleccionado);
          } catch {
            tomSamplerBuffers[tomId] = null;
          }
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
      if (window._previewSource && typeof window._previewSource.stop === 'function') {
        try { window._previewSource.stop(); } catch {}
      }
      tomSeleccionado = null;
      samplerSeleccionado = null;
      padSeleccionado = null;
      padSamplerSeleccionado = null;
    }
  });

  const originalAbrirModal = abrirModal;
  abrirModal = function(boton) {
    tomSeleccionado = boton;
    lastCapturedCode = null;
    switchTab('sampler');
    if (!modal || !listaSamplers) return;
    samplerSeleccionado = null;
    listaSamplers.innerHTML = '';
    const currentFile = tomAudioMap[boton.id] || '';
    samplerList.forEach(nombreArchivo => {
      const li = document.createElement('li');
      li.textContent = nombreArchivo.replace(/\.[^.]+$/, '');
      li.title = nombreArchivo;
      li.className = 'sampler-item';
      li.tabIndex = 0;
      li.addEventListener('click', async () => {
        document.querySelectorAll('.sampler-item').forEach(el => el.classList.remove('selected'));
        li.classList.add('selected');
        samplerSeleccionado = nombreArchivo;
        if (window._previewSource && typeof window._previewSource.stop === 'function') {
          try { window._previewSource.stop(); } catch {}
        }
        try {
          const path = 'samplers/' + nombreArchivo;
          if (audioCtx.state !== 'running') await audioCtx.resume();
          const buffer = await loadSamplerBuffer(path);
          const source = audioCtx.createBufferSource();
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = _currentVolume;
          source.buffer = buffer;
          source.connect(gainNode).connect(audioCtx.destination);
          source.start(0);
          window._previewSource = source;
        } catch (e) { /* ignore preview errors */ }
      });
      li.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') li.click(); });
      if (currentFile.toLowerCase() === nombreArchivo.toLowerCase()) {
        li.classList.add('selected'); samplerSeleccionado = nombreArchivo;
      }
      listaSamplers.appendChild(li);
    });
    if (keyInput) keyInput.value = '';
    if (editModal) editModal.open();
  };

  cerrarModal = function() {
    if (editModal) editModal.close();
  };

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
});