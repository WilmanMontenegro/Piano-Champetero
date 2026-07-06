/**
 * Session recorder — captures kit output (+ PC system audio when available) to localStorage.
 * ponytail: localStorage ~5MB cap; max ~8 clips, ~3.5MB audio total, 2 min each.
 */

const INDEX_KEY = 'pianoChampeteroRecordingsIndex';
const DATA_PREFIX = 'pianoChampeteroRecording_';
const MAX_CLIPS = 8;
const MAX_TOTAL_CHARS = 3_500_000;
const MAX_DURATION_MS = 120_000;

function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(entries) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

function dataKey(id) {
  return DATA_PREFIX + id;
}

function formatClipName(date) {
  return `Grabación ${date.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function formatDuration(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function audioStorageChars() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DATA_PREFIX)) total += localStorage.getItem(key)?.length || 0;
  }
  return total;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la grabación.'));
    reader.readAsDataURL(blob);
  });
}

function buildPcAudioCaptureConstraints() {
  return {
    video: { displaySurface: { ideal: 'monitor' } },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: false,
      systemAudio: 'include',
    },
  };
}

async function capturePcAudioStream() {
  if (typeof navigator?.mediaDevices?.getDisplayMedia !== 'function') return null;
  const attempts = [
    buildPcAudioCaptureConstraints(),
    {
      video: { displaySurface: { ideal: 'monitor' } },
      audio: { suppressLocalAudioPlayback: false },
    },
    { video: true, audio: true },
  ];
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch {
      /* user cancelled or browser rejected — try looser constraints */
    }
  }
  return null;
}

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function fileExt(mime) {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('webm')) return 'webm';
  return 'audio';
}

export function listSessionRecordings() {
  return readIndex().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getSessionRecordingDataUrl(id) {
  try {
    return localStorage.getItem(dataKey(id));
  } catch {
    return null;
  }
}

export function deleteSessionRecording(id) {
  try {
    localStorage.removeItem(dataKey(id));
  } catch { /* ignore */ }
  writeIndex(readIndex().filter((entry) => entry.id !== id));
}

function evictOldestUntilRoom(neededChars) {
  let index = listSessionRecordings().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  while (index.length && audioStorageChars() + neededChars > MAX_TOTAL_CHARS) {
    deleteSessionRecording(index[0].id);
    index = listSessionRecordings().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }
  if (audioStorageChars() + neededChars > MAX_TOTAL_CHARS) {
    throw new Error('No hay espacio en este navegador. Borrá grabaciones viejas.');
  }
}

export async function saveSessionRecording({ blob, mime, durationMs }) {
  const dataUrl = await blobToDataUrl(blob);
  if (!dataUrl) throw new Error('Grabación vacía.');
  if (dataUrl.length > MAX_TOTAL_CHARS / 2) {
    throw new Error('Grabación muy larga. Probá con menos de 2 minutos.');
  }

  let index = readIndex();
  while (index.length >= MAX_CLIPS) {
    const oldest = [...index].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
    if (!oldest) break;
    deleteSessionRecording(oldest.id);
    index = readIndex();
  }

  evictOldestUntilRoom(dataUrl.length);

  const id = `rec_${Date.now()}`;
  const entry = {
    id,
    name: formatClipName(new Date()),
    createdAt: new Date().toISOString(),
    durationMs,
    mime: mime || blob.type || 'audio/webm',
  };

  localStorage.setItem(dataKey(id), dataUrl);
  writeIndex([entry, ...readIndex()]);
  return entry;
}

export function downloadSessionRecording(id) {
  const entry = listSessionRecordings().find((item) => item.id === id);
  const dataUrl = getSessionRecordingDataUrl(id);
  if (!entry || !dataUrl) return false;

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `bateria-champetera-${entry.id}.${fileExt(entry.mime)}`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

/**
 * @param {object} opts
 */
export function initSessionRecorder(opts) {
  const {
    audioCtx,
    getMasterGain,
    recordBtn,
    recordLabel,
    panel,
    sidebarEl,
    listEl,
    statusEl,
    onBeforeRecord,
    getSidebarMode,
    onActivate,
    registerRefresh,
  } = opts;
  if (!recordBtn || !listEl) return null;

  const canCapturePcAudio = typeof navigator?.mediaDevices?.getDisplayMedia === 'function';
  const defaultRecordLabel = canCapturePcAudio ? 'Grabar batería + PC' : 'Grabar audio';

  if (typeof MediaRecorder === 'undefined') {
    recordBtn.disabled = true;
    recordBtn.title = 'Grabación no disponible en este navegador';
    return;
  }

  let mediaRecorder = null;
  let streamDest = null;
  let chunks = [];
  let startedAt = 0;
  let maxTimer = 0;
  let tickTimer = 0;
  let previewAudio = null;
  let recording = false;
  let mixingPcAudio = false;
  /** @type {MediaStream | null} */
  let displayStream = null;
  /** @type {MediaStreamAudioSourceNode | null} */
  let displaySource = null;

  const isSidebarActive = () => !getSidebarMode || getSidebarMode() === 'audio';

  const setStatus = (text, isError = false, { downloadId } = {}) => {
    if (!statusEl) return;
    statusEl.replaceChildren();
    if (!text && !downloadId) {
      statusEl.hidden = true;
      return;
    }
    statusEl.hidden = false;
    statusEl.classList.toggle('session-record-status--error', isError);
    if (text) {
      const msg = document.createElement('span');
      msg.className = 'session-record-status-text';
      msg.textContent = text;
      statusEl.appendChild(msg);
    }
    if (downloadId) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctrl-btn session-record-download-now';
      btn.innerHTML = '<i class="fa-solid fa-download" aria-hidden="true"></i> Descargar ahora';
      btn.addEventListener('click', () => {
        if (!downloadSessionRecording(downloadId)) setStatus('No se pudo descargar.', true);
        else setStatus('Descarga iniciada. Revisá tu carpeta de descargas.');
      });
      statusEl.appendChild(btn);
    }
  };

  const stopPreview = () => {
    if (!previewAudio) return;
    previewAudio.pause();
    previewAudio = null;
  };

  const revealSavedRecording = (entryId) => {
    onActivate?.();
    if (panel) panel.hidden = false;
    sidebarEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    requestAnimationFrame(() => {
      const li = listEl.querySelector(`[data-rec-id="${entryId}"]`);
      li?.classList.add('session-recording-item--fresh');
      li?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      window.setTimeout(() => li?.classList.remove('session-recording-item--fresh'), 5000);
    });
  };

  const renderList = () => {
    const entries = listSessionRecordings();
    listEl.innerHTML = '';

    const showPanel = isSidebarActive() && (recording || entries.length > 0);
    if (panel) panel.hidden = !showPanel;
    if (!showPanel) return;

    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'session-recording-item';
      li.dataset.recId = entry.id;

      const meta = document.createElement('span');
      meta.className = 'session-recording-meta';
      meta.textContent = `${entry.name} (${formatDuration(entry.durationMs)})`;

      const actions = document.createElement('span');
      actions.className = 'session-recording-actions';

      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'ctrl-btn session-recording-action';
      playBtn.title = 'Escuchar';
      playBtn.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i>';
      playBtn.addEventListener('click', () => {
        const dataUrl = getSessionRecordingDataUrl(entry.id);
        if (!dataUrl) {
          setStatus('No se encontró la grabación.', true);
          return;
        }
        stopPreview();
        previewAudio = new Audio(dataUrl);
        previewAudio.play().catch(() => setStatus('No se pudo reproducir.', true));
      });

      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'ctrl-btn session-recording-action';
      downloadBtn.title = 'Descargar';
      downloadBtn.innerHTML = '<i class="fa-solid fa-download" aria-hidden="true"></i>';
      downloadBtn.addEventListener('click', () => {
        if (!downloadSessionRecording(entry.id)) setStatus('No se pudo descargar.', true);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'ctrl-btn session-recording-action session-recording-action--delete';
      deleteBtn.title = 'Borrar';
      deleteBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
      deleteBtn.addEventListener('click', () => {
        deleteSessionRecording(entry.id);
        setStatus('');
        renderList();
      });

      actions.append(playBtn, downloadBtn, deleteBtn);
      li.append(meta, actions);
      listEl.appendChild(li);
    }
  };

  const setRecordingUi = (on, elapsedMs = 0) => {
    recording = on;
    recordBtn.classList.toggle('active', on);
    recordBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (recordLabel) {
      recordLabel.textContent = on ? `Detener ${formatDuration(elapsedMs)}` : defaultRecordLabel;
    }
  };

  const cleanupGraph = () => {
    const master = getMasterGain();
    if (master && streamDest) {
      try { master.disconnect(streamDest); } catch { /* ignore */ }
    }
    if (displaySource && streamDest) {
      try { displaySource.disconnect(streamDest); } catch { /* ignore */ }
    }
    displaySource = null;
    if (displayStream) {
      for (const track of displayStream.getTracks()) track.stop();
      displayStream = null;
    }
    streamDest = null;
    mixingPcAudio = false;
  };

  const stopRecording = async () => {
    clearTimeout(maxTimer);
    clearInterval(tickTimer);
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      setRecordingUi(false);
      cleanupGraph();
      renderList();
      return;
    }

    const durationMs = Date.now() - startedAt;
    const mime = mediaRecorder.mimeType || pickMimeType() || 'audio/webm';
    const hadPcAudio = mixingPcAudio;

    await new Promise((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.stop();
    });

    cleanupGraph();
    mediaRecorder = null;
    setRecordingUi(false);

    const blob = new Blob(chunks, { type: mime });
    chunks = [];

    if (blob.size < 256) {
      renderList();
      setStatus('Grabación muy corta. Tocá la batería y volvé a grabar.', true);
      return;
    }

    try {
      const entry = await saveSessionRecording({ blob, mime, durationMs });
      renderList();
      revealSavedRecording(entry.id);
      const mixNote = hadPcAudio
        ? ' (batería + audio compartido del PC)'
        : ' (solo batería — en el diálogo marcá «Compartir audio» o «Audio del sistema»)';
      setStatus(`"${entry.name}" lista.${mixNote}`, false, { downloadId: entry.id });
    } catch (err) {
      renderList();
      setStatus(err instanceof Error ? err.message : 'No se pudo guardar.', true);
    }
  };

  const startRecording = async () => {
    setStatus('');
    stopPreview();
    onBeforeRecord?.();
    onActivate?.();

    const master = getMasterGain();
    if (!master) {
      setStatus('Audio no listo. Tocá un pad primero.', true);
      return;
    }

    if (canCapturePcAudio) {
      setStatus('Elegí pantalla o pestaña y activá «Compartir audio» / «Audio del sistema» para incluir música del PC.');
      displayStream = await capturePcAudioStream();
      if (displayStream?.getAudioTracks().length) {
        mixingPcAudio = true;
        for (const track of displayStream.getVideoTracks()) track.stop();
      } else if (displayStream) {
        for (const track of displayStream.getTracks()) track.stop();
        displayStream = null;
        setStatus('Sin audio del PC: grabando solo la batería. La próxima activá «Compartir audio» en el diálogo.');
      } else {
        setStatus('Sin audio del PC: grabando solo la batería.');
      }
    }

    try {
      await audioCtx.resume();
    } catch { /* ignore */ }

    const mimeType = pickMimeType();
    streamDest = audioCtx.createMediaStreamDestination();
    master.connect(streamDest);

    if (mixingPcAudio && displayStream) {
      displaySource = audioCtx.createMediaStreamSource(displayStream);
      displaySource.connect(streamDest);
      const audioTrack = displayStream.getAudioTracks()[0];
      if (audioTrack) audioTrack.addEventListener('ended', () => void stopRecording());
    }

    chunks = [];
    mediaRecorder = mimeType
      ? new MediaRecorder(streamDest.stream, { mimeType })
      : new MediaRecorder(streamDest.stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };

    startedAt = Date.now();
    mediaRecorder.start(1000);
    setRecordingUi(true, 0);
    renderList();
    if (mixingPcAudio) {
      setStatus('Grabando batería + audio compartido. Tocá cuando quieras.');
    }

    tickTimer = window.setInterval(() => {
      setRecordingUi(true, Date.now() - startedAt);
    }, 500);

    maxTimer = window.setTimeout(() => {
      setStatus('Límite de 2 minutos alcanzado. Grabación guardada.');
      void stopRecording();
    }, MAX_DURATION_MS);
  };

  recordBtn.addEventListener('click', () => {
    if (mediaRecorder?.state === 'recording') void stopRecording();
    else void startRecording();
  });

  registerRefresh?.(renderList);
  renderList();

  return {
    stopIfRecording: () => {
      if (mediaRecorder?.state === 'recording') return stopRecording();
      return undefined;
    },
  };
}
