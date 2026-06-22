/**
 * Note repeat (MPC-style redoble) — opt-in via "Redoble" toggle in UI.
 * Default off: one-shot drums (hold key = sample plays once to end).
 */

import { AUDIO_UI } from './site-config.js';

const NR_STORAGE_KEY = 'pianoChampeteroNoteRepeat';

/** @type {Map<string, { delayId?: number, intervalId?: number }>} */
const repeatHandles = new Map();

/** User toggle; null = read localStorage / config default (off). */
let noteRepeatOverride = null;

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

/** 1/16 note at ~120 BPM ≈ 125 ms (MPC Timing Correct reference). */
export function noteRepeatIntervalMs() {
  const interval = AUDIO_UI.noteRepeat?.intervalMs ?? 125;
  const mask = AUDIO_UI.retriggerMaskMs ?? 45;
  return Math.max(interval, mask + 5);
}

/**
 * @param {string} voiceKey
 * @param {() => void} tick
 */
export function startNoteRepeat(voiceKey, tick) {
  if (!isNoteRepeatEnabled()) return;
  stopNoteRepeat(voiceKey);
  const intervalMs = noteRepeatIntervalMs();
  const intervalId = window.setInterval(tick, intervalMs);
  repeatHandles.set(voiceKey, { intervalId });
}

/** @param {string} voiceKey */
export function stopNoteRepeat(voiceKey) {
  const handle = repeatHandles.get(voiceKey);
  if (!handle) return;
  if (handle.delayId !== undefined) window.clearTimeout(handle.delayId);
  if (handle.intervalId !== undefined) window.clearInterval(handle.intervalId);
  repeatHandles.delete(voiceKey);
}

export function stopAllNoteRepeat() {
  for (const key of [...repeatHandles.keys()]) stopNoteRepeat(key);
}
