/**
 * Local WAV/MP3 preview — files from disk, not samplers/ folder.
 */

const audioCtx = new AudioContext();
/** @type {Map<string, { file: File, buffer: AudioBuffer }>} */
const entries = new Map();

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const listEl = document.getElementById('preview-list');
const statusEl = document.getElementById('preview-status');
const volumeSlider = document.getElementById('preview-volume');
const volumeLabel = document.getElementById('preview-volume-label');

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  return `${seconds.toFixed(2)} s`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function entryKey(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function getVolume() {
  return volumeSlider ? Number(volumeSlider.value) : 0.85;
}

function updateVolumeLabel() {
  if (volumeLabel && volumeSlider) {
    volumeLabel.textContent = `${Math.round(Number(volumeSlider.value) * 100)}%`;
  }
}

async function playEntry(id) {
  const entry = entries.get(id);
  if (!entry) return;
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  gain.gain.value = getVolume();
  source.buffer = entry.buffer;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start(0);
  setStatus(`Reproduciendo: ${entry.file.name}`);
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';

  if (entries.size === 0) {
    listEl.hidden = true;
    return;
  }

  listEl.hidden = false;
  for (const [id, entry] of entries) {
    const li = document.createElement('li');
    li.className = 'preview-item';

    const meta = document.createElement('div');
    meta.className = 'preview-item-meta';
    meta.innerHTML = `
      <span class="preview-item-name">${escapeHtml(entry.file.name)}</span>
      <span class="preview-item-detail">${formatDuration(entry.buffer.duration)} · ${formatSize(entry.file.size)}</span>
    `;

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'preview-play-btn';
    playBtn.textContent = '▶ Reproducir';
    playBtn.addEventListener('click', () => playEntry(id));

    li.append(meta, playBtn);
    listEl.appendChild(li);
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function addFiles(fileList) {
  const files = Array.from(fileList).filter((f) => /\.(wav|mp3)$/i.test(f.name));
  if (files.length === 0) {
    setStatus('No se encontraron archivos .wav o .mp3.');
    return;
  }

  if (audioCtx.state === 'suspended') await audioCtx.resume();

  let added = 0;
  let failed = 0;

  for (const file of files) {
    const id = entryKey(file);
    if (entries.has(id)) continue;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await audioCtx.decodeAudioData(arrayBuffer);
      entries.set(id, { file, buffer });
      added += 1;
    } catch {
      failed += 1;
    }
  }

  renderList();

  if (added && failed) {
    setStatus(`${added} archivo(s) listo(s). ${failed} no se pudo decodificar.`);
  } else if (added) {
    setStatus(`${added} archivo(s) listo(s). Haz clic en Reproducir.`);
  } else if (failed) {
    setStatus('No se pudo decodificar el audio. Revisa que sea .wav o .mp3 válido.');
  } else {
    setStatus('Esos archivos ya estaban en la lista.');
  }
}

function initDropZone() {
  if (!dropZone) return;

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drop-zone--active');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drop-zone--active');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drop-zone--active');
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  });
}

fileInput?.addEventListener('change', () => {
  if (fileInput.files?.length) addFiles(fileInput.files);
  fileInput.value = '';
});

volumeSlider?.addEventListener('input', updateVolumeLabel);

initDropZone();
updateVolumeLabel();
setStatus('Arrastra samplers o elige archivos para empezar.');
