/**
 * Note repeat (MPC-style redoble) — opt-in via "Redoble" toggle in UI.
 * Default off: one-shot drums (hold key = sample plays once to end).
 *
 * Rate ref @ 120 BPM (Akai Timing Correct):
 *   1/32 = 62.5 ms | 1/16 = 125 ms | 1/8 = 250 ms
 * Speed dial: slider 0 (lento) … 100 (rápido) → maxMs … minMs.
 * Clock: performance.now() anchors (setInterval drifts).
 */

import { AUDIO_UI } from './site-config.js';

const NR_STORAGE_KEY = 'pianoChampeteroNoteRepeat';
const NR_RATE_STORAGE_KEY = 'pianoChampeteroNoteRepeatRate';

/** @type {Map<string, { timeoutId?: number, nextAt?: number }>} */
const repeatHandles = new Map();

/** User toggle; null = read localStorage / config default (off). */
let noteRepeatOverride = null;
/** Cached interval ms from dial; null = read storage / config. */
let intervalOverrideMs = null;

function nrMinMs() {
  return AUDIO_UI.noteRepeat?.minMs ?? 62.5;
}

function nrMaxMs() {
  return AUDIO_UI.noteRepeat?.maxMs ?? 250;
}

function nrDefaultMs() {
  return AUDIO_UI.noteRepeat?.intervalMs ?? 125;
}

export function isNoteRepeatEnabled() {
  if (noteRepeatOverride !== null) return noteRepeatOverride;
  try {
    const stored = localStorage.getItem(NR_STORAGE_KEY);
    if (stored !== null) return stored === '1';
  } catch { /* ignore */ }
  return AUDIO_UI.noteRepeat?.enabled === true;
}

/** @param {boolean} on */
export function setNoteRepeatEnabled(on) {
  noteRepeatOverride = on;
  try { localStorage.setItem(NR_STORAGE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  if (!on) stopAllNoteRepeat();
}

/** Slider 0..100 → interval ms (0=lento/maxMs, 100=rápido/minMs). */
export function noteRepeatSliderToMs(slider0to100) {
  const t = Math.min(100, Math.max(0, Number(slider0to100) || 0)) / 100;
  return nrMaxMs() - t * (nrMaxMs() - nrMinMs());
}

/** Interval ms → slider 0..100. */
export function noteRepeatMsToSlider(ms) {
  const span = nrMaxMs() - nrMinMs();
  if (span <= 0) return 50;
  return Math.round(100 * (nrMaxMs() - ms) / span);
}

/** Nearest musical label @ 120 BPM feel. */
export function noteRepeatRateLabel(ms) {
  if (ms <= 72) return '1/32';
  if (ms <= 100) return '1/16T';
  if (ms <= 145) return '1/16';
  if (ms <= 200) return '1/8T';
  return '1/8';
}

function readStoredIntervalMs() {
  try {
    const raw = localStorage.getItem(NR_RATE_STORAGE_KEY);
    if (raw === null) return null;
    const ms = Number(raw);
    if (!Number.isFinite(ms)) return null;
    return Math.min(nrMaxMs(), Math.max(nrMinMs(), ms));
  } catch {
    return null;
  }
}

/** Current redoble interval (ms). */
export function noteRepeatIntervalMs() {
  const mask = AUDIO_UI.retriggerMaskMs ?? 28;
  const base = intervalOverrideMs ?? readStoredIntervalMs() ?? nrDefaultMs();
  return Math.max(base, mask + 5);
}

/** @param {number} ms */
export function setNoteRepeatIntervalMs(ms) {
  const clamped = Math.min(nrMaxMs(), Math.max(nrMinMs(), ms));
  intervalOverrideMs = clamped;
  try { localStorage.setItem(NR_RATE_STORAGE_KEY, String(clamped)); } catch { /* ignore */ }
}

/**
 * @param {string} voiceKey
 * @param {() => void} tick
 */
export function startNoteRepeat(voiceKey, tick) {
  if (!isNoteRepeatEnabled()) return;
  stopNoteRepeat(voiceKey);

  const handle = { nextAt: performance.now() + noteRepeatIntervalMs() };
  repeatHandles.set(voiceKey, handle);

  const scheduleNext = () => {
    if (!repeatHandles.has(voiceKey)) return;
    const delay = Math.max(0, handle.nextAt - performance.now());
    handle.timeoutId = window.setTimeout(() => {
      if (!repeatHandles.has(voiceKey)) return;
      tick();
      // Re-read dial each tick so moving the perilla applies live
      handle.nextAt = performance.now() + noteRepeatIntervalMs();
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

/** @param {string} voiceKey */
export function stopNoteRepeat(voiceKey) {
  const handle = repeatHandles.get(voiceKey);
  if (!handle) return;
  if (handle.timeoutId !== undefined) window.clearTimeout(handle.timeoutId);
  repeatHandles.delete(voiceKey);
}

export function stopAllNoteRepeat() {
  for (const key of [...repeatHandles.keys()]) stopNoteRepeat(key);
}
