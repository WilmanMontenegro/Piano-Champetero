// js/virtual.js — lógica de la batería para virtual.html
import { loadHeader, setYearFooter, resumeOnUserGesture } from './common.js';

export const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

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

export const keyToTomIdDefaults = { q: 'tom-1', w: 'tom-2', e: 'tom-3', a: 'tom-4', s: 'tom-5', d: 'tom-6', z: 'tom-7', x: 'tom-8', c: 'tom-9' };

export const tomSamplerBuffers = {};
export let currentVolume = 0.5;
export let samplersDisponibles = [];

let keyToTomId = {};
let _currentVolume = currentVolume;

export function saveKeyMapping(map) { try { const normalized = normalizeKeyMap(map); localStorage.setItem('pianoChampeteroKeyMap', JSON.stringify(normalized)); } catch (e) {} }
export function loadKeyMapping() {
  const data = localStorage.getItem('pianoChampeteroKeyMap');
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    const normalized = normalizeKeyMap(parsed);
    try {
      const origStr = JSON.stringify(parsed);
      const normStr = JSON.stringify(normalized);
      if (origStr !== normStr) {
        localStorage.setItem('pianoChampeteroKeyMap', normStr);
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
    } else if (/^[A-Za-z]$/.test(k)) code = 'Key' + k.toUpperCase();
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

function prettyName(fileName) {
  if (!fileName) return '';
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
}

export function saveSamplers() {
  const onlyName = {};
  Object.keys(tomAudioMap).forEach(k => {
    const name = tomAudioMap[k] ? tomAudioMap[k].split('/').pop() : '';
    onlyName[k] = name;
  });
  try { localStorage.setItem('pianoChampeteroSamplers', JSON.stringify(onlyName)); } catch {}
}

export function resetSettings() {
  localStorage.removeItem('pianoChampeteroSamplers');
  localStorage.removeItem('pianoChampeteroKeyMap');
  Object.keys(tomAudioMap).forEach(k => tomAudioMap[k] = tomSamplersDefaults[k]);
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

export async function loadSamplerBuffer(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

export async function preloadAllSamplers() {
  await loadAvailableSamplers();
  await Promise.all(Object.entries(tomAudioMap).map(async ([tomId, fileName]) => {
    if (fileName) {
      try { tomSamplerBuffers[tomId] = await loadSamplerBuffer('samplers/' + fileName); } catch { tomSamplerBuffers[tomId] = null; }
    } else tomSamplerBuffers[tomId] = null;
  }));
}

export function playTomSampler(tomId) {
  const buffer = tomSamplerBuffers[tomId];
  if (!buffer) return;
  const slider = document.getElementById('volume-slider');
  let volume = currentVolume;
  if (slider) volume = +slider.value;
  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;
  source.buffer = buffer;
  source.connect(gainNode).connect(audioCtx.destination);
  source.start();
}

export async function activateTomSampler(tomId) {
  const button = document.getElementById(tomId);
  if (!button) return;
  button.classList.add('active');
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
    requestAnimationFrame(() => playTomSampler(tomId));
  } else {
    requestAnimationFrame(() => playTomSampler(tomId));
  }
  setTimeout(() => button.classList.remove('active'), 60);
}

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
  await loadHeader();
  const navVirtual = document.getElementById('nav-virtual');
  if (navVirtual) navVirtual.classList.add('active');
  setYearFooter();
  resumeOnUserGesture();

  if (!isMainPage) return;

  const savedKeys = loadKeyMapping();
  if (savedKeys) keyToTomId = normalizeKeyMap(savedKeys);
  else keyToTomId = normalizeKeyMap(keyToTomIdDefaults);

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

  // Edit state
  let modoEdicion = false;
  let tomSeleccionado = null;
  let samplerSeleccionado = null;
  let activeTab = 'sampler';
  let lastCapturedCode = null;

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
    if (tab === 'key' && keyInput) { keyInput.value = ''; keyInput.focus(); }
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
          source.start();
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

  if (saveBtn) saveBtn.addEventListener('click', async () => {
    if (!tomSeleccionado) return;
    const tomId = tomSeleccionado.id;
    if (activeTab === 'sampler' && samplerSeleccionado) {
      tomAudioMap[tomId] = samplerSeleccionado;
      try { 
        tomSamplerBuffers[tomId] = await loadSamplerBuffer('samplers/' + samplerSeleccionado);
      } catch { 
        tomSamplerBuffers[tomId] = null; 
      }
      saveSamplers();
      actualizarNombresPads();
    }
    if (activeTab === 'key' && lastCapturedCode) {
      const tomId = tomSeleccionado.id;
      Object.keys(keyToTomId).forEach(k => { if (keyToTomId[k] === tomId) delete keyToTomId[k]; });
      if (keyToTomId[lastCapturedCode]) delete keyToTomId[lastCapturedCode];
      keyToTomId[lastCapturedCode] = tomId;
      saveKeyMapping(keyToTomId);
      actualizarEtiquetasTeclas(keyToTomId);
      actualizarNombresPads();
    }
    cerrarModal();
  });

  if (cancelBtn) cancelBtn.addEventListener('click', cerrarModal);
  if (modal) modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { cerrarModal(); return; }
    // Navegación con flechas en la lista de samplers
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
    // Enter para guardar
    if (e.key === 'Enter' && saveBtn) { saveBtn.click(); }
  });

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
    if (!e.key) return;
    const code = e.code || '';
    const inferredKey = (/^[0-9]$/.test(e.key)) ? ('Digit' + e.key) : ('Key' + (e.key || '').toUpperCase());
    const tomId = keyToTomId[code] || keyToTomId[inferredKey] || keyToTomId[e.key.toLowerCase()];
    if (tomId) { e.preventDefault(); await activateTomSampler(tomId); }
  });

  window.addEventListener('focus', async () => {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    await preloadAllSamplers();
  });

  const btnReset = document.getElementById('reset-settings-btn');
  const modalReset = document.getElementById('modal-confirm-reset');
  const confirmarResetBtn = document.getElementById('confirm-reset-btn');
  const cancelarResetBtn = document.getElementById('cancel-reset-btn');
  if (btnReset && modalReset && confirmarResetBtn && cancelarResetBtn) {
    btnReset.addEventListener('click', () => { modalReset.style.display = 'flex'; confirmarResetBtn.focus(); });
    confirmarResetBtn.addEventListener('click', async () => {
      resetSettings();
      await preloadAllSamplers();
      keyToTomId = normalizeKeyMap(keyToTomIdDefaults);
      actualizarEtiquetasTeclas(keyToTomId);
      actualizarNombresPads();
      modalReset.style.display = 'none';
    });
    cancelarResetBtn.addEventListener('click', () => { modalReset.style.display = 'none'; });
    modalReset.addEventListener('keydown', e => { if (e.key === 'Escape') modalReset.style.display = 'none'; });
  }
});