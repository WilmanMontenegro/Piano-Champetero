/**
 * Canvas visualizer — waveform + frequency bars (Web Audio AnalyserNode).
 */

const STORAGE_KEY = 'pianoChampeteroVisualizerEnabled';
const BAR_COUNT = 48;
const SILENT_FRAMES_MAX = 45;
const ACTIVITY_THRESHOLD = 16;

/** @type {(() => void) | null} */
let pulseFn = null;

/**
 * @param {{ analyser: AnalyserNode }} options
 */
export function initAudioVisualizer({ analyser }) {
  const panel = document.getElementById('audio-viz-panel');
  const canvas = document.getElementById('audio-viz-canvas');
  const toggle = document.getElementById('audio-viz-toggle');
  if (!panel || !canvas || !toggle || !analyser) return;

  let enabled = localStorage.getItem(STORAGE_KEY) !== 'false';
  /** @type {number | null} */
  let rafId = null;
  let silentFrames = SILENT_FRAMES_MAX;

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  function readColors() {
    const style = getComputedStyle(panel);
    return {
      wave: style.getPropertyValue('--viz-wave').trim() || '#FFE066',
      barStart: style.getPropertyValue('--viz-bar-start').trim() || '#FF9A56',
      barEnd: style.getPropertyValue('--viz-bar-end').trim() || '#FF6B6B',
      glow: style.getPropertyValue('--viz-glow').trim() || 'rgba(255, 224, 102, 0.45)',
    };
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function drawIdle(w, h) {
    const colors = readColors();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(0, 0, w, h);

    const midY = h * 0.38;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = Math.max(1, w / 512);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    const barW = w / BAR_COUNT;
    const baseY = h * 0.92;
    for (let i = 0; i < BAR_COUNT; i++) {
      const idleH = h * 0.04 + Math.sin(i * 0.35) * h * 0.012;
      const grad = ctx.createLinearGradient(0, baseY - idleH, 0, baseY);
      grad.addColorStop(0, colors.barStart);
      grad.addColorStop(1, colors.barEnd);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(i * barW + barW * 0.18, baseY - idleH, barW * 0.64, idleH);
    }
    ctx.globalAlpha = 1;
  }

  function drawActive(w, h) {
    const colors = readColors();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(0, 0, w, h);

    const waveTop = h * 0.08;
    const waveH = h * 0.42;
    const waveMid = waveTop + waveH * 0.5;

    ctx.strokeStyle = colors.wave;
    ctx.lineWidth = Math.max(1.5, w / 320);
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = w / 80;
    ctx.beginPath();
    const slice = timeData.length / w;
    for (let x = 0; x < w; x++) {
      const idx = Math.min(timeData.length - 1, Math.floor(x * slice));
      const v = (timeData[idx] - 128) / 128;
      const y = waveMid + v * waveH * 0.46;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, waveMid);
    ctx.lineTo(w, waveMid);
    ctx.stroke();

    const barsTop = h * 0.56;
    const barsH = h * 0.36;
    const barW = w / BAR_COUNT;
    const step = Math.max(1, Math.floor(freqData.length / BAR_COUNT));

    for (let i = 0; i < BAR_COUNT; i++) {
      let peak = 0;
      const start = i * step;
      for (let j = 0; j < step; j++) {
        const val = freqData[start + j] || 0;
        if (val > peak) peak = val;
      }
      const norm = peak / 255;
      const barHeight = Math.max(barsH * 0.06, barsH * norm);
      const x = i * barW + barW * 0.14;
      const bw = barW * 0.72;

      const grad = ctx.createLinearGradient(0, barsTop + barsH - barHeight, 0, barsTop + barsH);
      grad.addColorStop(0, colors.barStart);
      grad.addColorStop(0.55, colors.wave);
      grad.addColorStop(1, colors.barEnd);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.35 + norm * 0.65;
      ctx.fillRect(x, barsTop + barsH - barHeight, bw, barHeight);
    }
    ctx.globalAlpha = 1;
  }

  function drawFrame() {
    resizeCanvas();
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);

    let sum = 0;
    for (let i = 0; i < freqData.length; i++) sum += freqData[i];
    const activity = sum / freqData.length;

    if (activity < ACTIVITY_THRESHOLD) {
      silentFrames++;
      if (silentFrames >= SILENT_FRAMES_MAX) {
        drawIdle(w, h);
        rafId = null;
        return;
      }
    } else {
      silentFrames = 0;
    }

    drawActive(w, h);
    rafId = requestAnimationFrame(drawFrame);
  }

  function startLoop() {
    if (!enabled || rafId !== null) return;
    silentFrames = 0;
    rafId = requestAnimationFrame(drawFrame);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function applyEnabledState() {
    panel.classList.toggle('audio-viz-panel--off', !enabled);
    toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    toggle.textContent = enabled ? 'Activo' : 'Inactivo';
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    if (enabled) {
      resizeCanvas();
      drawIdle(canvas.width, canvas.height);
    } else {
      stopLoop();
    }
  }

  toggle.addEventListener('click', () => {
    enabled = !enabled;
    applyEnabledState();
    if (enabled) startLoop();
  });

  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
        resizeCanvas();
        if (enabled && rafId === null) drawIdle(canvas.width, canvas.height);
      })
    : null;
  if (ro) ro.observe(canvas);
  window.addEventListener('resize', () => resizeCanvas());

  applyEnabledState();
  resizeCanvas();
  drawIdle(canvas.width, canvas.height);

  pulseFn = () => {
    if (!enabled) return;
    startLoop();
  };
}

export function pulseAudioVisualizer() {
  pulseFn?.();
}
