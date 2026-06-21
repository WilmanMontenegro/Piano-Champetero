/**
 * Modal sampler preview — single voice, stops previous preview on new play.
 */

import { samplerUrl } from './sampler-path.js';

/** @type {AudioBufferSourceNode | null} */
let previewSource = null;

export function stopSamplerPreview() {
  if (!previewSource) return;
  try {
    previewSource.stop();
  } catch {
    /* already stopped */
  }
  previewSource = null;
}

/**
 * @param {AudioContext} audioCtx
 * @param {string} relativePath under samplers/
 * @param {{
 *   getVolume: () => number,
 *   loadBuffer: (url: string) => Promise<AudioBuffer>,
 *   connectHit: (gain: GainNode) => void,
 *   pulseViz?: () => void,
 * }} deps
 */
export async function previewSamplerPath(audioCtx, relativePath, deps) {
  stopSamplerPreview();
  if (!relativePath) return;
  try {
    if (audioCtx.state !== 'running') await audioCtx.resume();
    const buffer = await deps.loadBuffer(samplerUrl(relativePath));
    const source = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = deps.getVolume();
    source.buffer = buffer;
    source.connect(gainNode);
    deps.connectHit(gainNode);
    source.start(0);
    previewSource = source;
    deps.pulseViz?.();
  } catch {
    /* ignore preview errors */
  }
}
