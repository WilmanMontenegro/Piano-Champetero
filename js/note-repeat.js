/**
 * Note repeat — retrigger same pad while key/button is held (champeta rolls).
 */

import { AUDIO_UI } from './site-config.js';

/** @type {Map<string, number>} voiceKey → timer id */
const repeatTimers = new Map();

export function isNoteRepeatEnabled() {
  return AUDIO_UI.noteRepeat?.enabled !== false;
}

export function noteRepeatIntervalMs() {
  const interval = AUDIO_UI.noteRepeat?.intervalMs ?? 110;
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
  const ms = noteRepeatIntervalMs();
  const id = window.setInterval(tick, ms);
  repeatTimers.set(voiceKey, id);
}

/** @param {string} voiceKey */
export function stopNoteRepeat(voiceKey) {
  const id = repeatTimers.get(voiceKey);
  if (id === undefined) return;
  window.clearInterval(id);
  repeatTimers.delete(voiceKey);
}

export function stopAllNoteRepeat() {
  for (const key of repeatTimers.keys()) stopNoteRepeat(key);
}
