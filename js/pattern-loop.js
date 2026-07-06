/**
 * Pattern loop recorder — captures hit sequence (tom/pad + timing) and loops playback.
 * Stored in localStorage as JSON (small; not audio blobs).
 */

const INDEX_KEY = 'pianoChampeteroPatternLoopsIndex';
const DATA_PREFIX = 'pianoChampeteroPatternLoop_';
const MAX_PATTERNS = 12;
const MAX_EVENTS = 200;
const MAX_CAPTURE_MS = 30_000;
const LOOP_TAIL_MS = 450;
const MIN_LOOP_MS = 800;

let capturing = false;
let captureStart = 0;
let captureEvents = [];
let captureMaxTimer = 0;
let loopGen = 0;
let loopInterval = 0;
let loopTimeouts = [];
let activeLoopId = null;
let getViewContext = () => ({ view: 'bateria', gridType: '3x4' });
let playHitRef = () => {};
let ensureContextRef = async () => {};
let onUiChange = () => {};
let onBeforeCaptureRef = () => {};
let onAutoCaptureEndRef = () => {};

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

function formatPatternName(date) {
  return `Loop ${date.toLocaleString('es-CO', {
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

export function isPatternCapturing() {
  return capturing;
}

export function isPatternLoopPlaying() {
  return activeLoopId != null;
}

export function getActivePatternLoopId() {
  return activeLoopId;
}

export function listPatternLoops() {
  return readIndex().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getPatternLoop(id) {
  try {
    const raw = localStorage.getItem(dataKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function deletePatternLoop(id) {
  try {
    localStorage.removeItem(dataKey(id));
  } catch { /* ignore */ }
  writeIndex(readIndex().filter((entry) => entry.id !== id));
  if (activeLoopId === id) stopPatternLoop();
}

function savePattern(pattern) {
  localStorage.setItem(dataKey(pattern.id), JSON.stringify(pattern));
  let index = readIndex();
  while (index.length >= MAX_PATTERNS) {
    const oldest = [...index].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
    if (!oldest) break;
    deletePatternLoop(oldest.id);
    index = readIndex();
  }
  const meta = {
    id: pattern.id,
    name: pattern.name,
    createdAt: pattern.createdAt,
    loopMs: pattern.loopMs,
    hits: pattern.events.length,
    view: pattern.view,
    gridType: pattern.gridType,
  };
  writeIndex([meta, ...readIndex()]);
  return meta;
}

function clearLoopTimers() {
  clearInterval(loopInterval);
  loopInterval = 0;
  for (const id of loopTimeouts) clearTimeout(id);
  loopTimeouts = [];
}

export function stopPatternLoop() {
  loopGen += 1;
  clearLoopTimers();
  activeLoopId = null;
  onUiChange();
}

function scheduleHit(ev, gen) {
  const id = window.setTimeout(() => {
    if (gen !== loopGen) return;
    playHitRef(ev);
  }, ev.t);
  loopTimeouts.push(id);
}

function runLoopCycle(pattern, gen) {
  for (const ev of pattern.events) scheduleHit(ev, gen);
}

export async function startPatternLoop(id) {
  const pattern = getPatternLoop(id);
  if (!pattern?.events?.length) return false;

  stopPatternLoop();
  await ensureContextRef(pattern);

  const gen = ++loopGen;
  activeLoopId = id;
  onUiChange();

  runLoopCycle(pattern, gen);
  loopInterval = window.setInterval(() => {
    if (gen !== loopGen) return;
    runLoopCycle(pattern, gen);
  }, pattern.loopMs);

  return true;
}

export function notifyPatternHit(hit) {
  if (!capturing || !hit) return;
  if (captureEvents.length >= MAX_EVENTS) return;
  if (!captureStart) {
    captureStart = performance.now();
    clearTimeout(captureMaxTimer);
    captureMaxTimer = window.setTimeout(() => {
      onAutoCaptureEndRef(stopPatternCapture({ auto: true }));
    }, MAX_CAPTURE_MS);
  }
  captureEvents.push({
    t: Math.round(performance.now() - captureStart),
    kind: hit.kind,
    id: hit.id,
  });
}

export function startPatternCapture() {
  if (capturing) return false;
  stopPatternLoop();
  onBeforeCaptureRef();

  const ctx = getViewContext();
  capturing = true;
  captureStart = 0;
  captureEvents = [];

  onUiChange();
  return ctx;
}

/**
 * @param {{ auto?: boolean }} [opts]
 * @returns {object|null}
 */
export function stopPatternCapture(opts = {}) {
  if (!capturing) return null;

  clearTimeout(captureMaxTimer);
  capturing = false;
  onUiChange();

  if (captureEvents.length < 2) {
    captureEvents = [];
    return { error: opts.auto
      ? 'Tiempo máximo alcanzado. Tocá al menos 2 sonidos para guardar un loop.'
      : 'Tocá al menos 2 sonidos para guardar el loop.' };
  }

  const ctx = getViewContext();
  const lastT = captureEvents[captureEvents.length - 1].t;
  const loopMs = Math.min(MAX_CAPTURE_MS, Math.max(MIN_LOOP_MS, lastT + LOOP_TAIL_MS));

  const pattern = {
    id: `pat_${Date.now()}`,
    name: formatPatternName(new Date()),
    createdAt: new Date().toISOString(),
    view: ctx.view,
    gridType: ctx.gridType,
    loopMs,
    events: captureEvents.map((ev) => ({ ...ev })),
  };

  captureEvents = [];
  savePattern(pattern);
  return { pattern };
}

/**
 * @param {object} opts
 */
export function initPatternLoops(opts) {
  const {
    recordBtn,
    recordLabel,
    panel,
    listEl,
    statusEl,
    playHit,
    ensureContext,
    getContext,
    onBeforeCapture,
    getSidebarMode,
    onActivate,
    registerRefresh,
  } = opts;

  if (!recordBtn || !listEl) return;

  playHitRef = playHit || playHitRef;
  ensureContextRef = ensureContext || ensureContextRef;
  getViewContext = getContext || getViewContext;
  onBeforeCaptureRef = onBeforeCapture || onBeforeCaptureRef;

  const isSidebarActive = () => !getSidebarMode || getSidebarMode() === 'loop';

  const finishCapture = (result) => {
    if (result?.error) {
      setStatus(result.error, true);
      return;
    }
    if (result?.pattern) {
      renderList();
      setStatus(`"${result.pattern.name}" guardado. Pulsa repetir para escucharlo en loop.`);
    }
  };

  onAutoCaptureEndRef = finishCapture;

  const setStatus = (text, isError = false) => {
    if (!statusEl) return;
    statusEl.hidden = !text;
    statusEl.textContent = text;
    statusEl.classList.toggle('pattern-loop-status--error', isError);
  };

  const setCaptureUi = (on) => {
    recordBtn.classList.toggle('active', on);
    recordBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (recordLabel) recordLabel.textContent = on ? 'Detener loop' : 'Crear loop';
  };

  const renderList = () => {
    const entries = listPatternLoops();
    listEl.innerHTML = '';

    const showPanel = isSidebarActive()
      && (isPatternCapturing() || isPatternLoopPlaying() || entries.length > 0);
    if (panel) panel.hidden = !showPanel;
    if (!showPanel) return;

    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'pattern-loop-item';

      const meta = document.createElement('span');
      meta.className = 'pattern-loop-meta';
      const viewLabel = entry.view === 'pads' ? `Pads ${entry.gridType || ''}`.trim() : 'Batería';
      meta.textContent = `${entry.name} · ${entry.hits} golpes · ${formatDuration(entry.loopMs)} · ${viewLabel}`;

      const actions = document.createElement('span');
      actions.className = 'pattern-loop-actions';

      const loopBtn = document.createElement('button');
      loopBtn.type = 'button';
      loopBtn.className = 'ctrl-btn pattern-loop-action' + (activeLoopId === entry.id ? ' active' : '');
      loopBtn.title = activeLoopId === entry.id ? 'Detener repetición' : 'Repetir loop';
      loopBtn.innerHTML = activeLoopId === entry.id
        ? '<i class="fa-solid fa-stop" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-repeat" aria-hidden="true"></i>';
      loopBtn.addEventListener('click', async () => {
        if (activeLoopId === entry.id) {
          stopPatternLoop();
          setStatus('Loop detenido.');
          renderList();
          return;
        }
        onActivate?.();
        const ok = await startPatternLoop(entry.id);
        if (!ok) {
          setStatus('No se pudo reproducir el loop.', true);
          return;
        }
        setStatus(`"${entry.name}" repitiéndose. Pulsa stop para detener.`);
        renderList();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'ctrl-btn pattern-loop-action pattern-loop-action--delete';
      deleteBtn.title = 'Borrar loop';
      deleteBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
      deleteBtn.addEventListener('click', () => {
        deletePatternLoop(entry.id);
        renderList();
        setStatus('Loop borrado.');
      });

      actions.append(loopBtn, deleteBtn);
      li.append(meta, actions);
      listEl.appendChild(li);
    }
  };

  onUiChange = () => {
    setCaptureUi(isPatternCapturing());
    renderList();
  };

  recordBtn.addEventListener('click', () => {
    if (isPatternCapturing()) {
      finishCapture(stopPatternCapture());
      return;
    }

    setStatus('');
    onActivate?.();
    startPatternCapture();
    setStatus('Listo: el loop empieza cuando toques el primer sonido. Pulsa Detener loop cuando termines.');
  });

  registerRefresh?.(renderList);
  renderList();
}
