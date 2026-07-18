/**
 * Modal sampler preview — single voice, stops previous preview on new play.
 * In-flight loads are cancelled via epoch so rapid clicks don't stack voices.
 */

import { samplerUrl } from './sampler-path.js';

/** @type {AudioBufferSourceNode | null} */
let previewSource = null;
let previewEpoch = 0;

function stopPreviewSource() {
  if (!previewSource) return;
  try {
    previewSource.stop();
  } catch {
    /* already stopped */
  }
  previewSource = null;
}

export function stopSamplerPreview() {
  previewEpoch += 1;
  stopPreviewSource();
}

/**
 * @param {AudioContext} audioCtx
 * @param {string} relativePath under samplers/
 * @param {{
 *   getVolume: () => number,
 *   getPlaybackRate?: () => number,
 *   loadBuffer: (url: string) => Promise<AudioBuffer>,
 *   connectHit: (gain: GainNode) => void,
 *   pulseViz?: () => void,
 * }} deps
 */
export async function previewSamplerPath(audioCtx, relativePath, deps) {
  const epoch = ++previewEpoch;
  stopPreviewSource();
  if (!relativePath) return;
  try {
    if (audioCtx.state !== 'running') await audioCtx.resume();
    if (epoch !== previewEpoch) return;
    const buffer = await deps.loadBuffer(samplerUrl(relativePath));
    if (epoch !== previewEpoch) return;
    stopPreviewSource();
    const source = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = deps.getVolume();
    source.buffer = buffer;
    source.playbackRate.value = deps.getPlaybackRate?.() ?? 1;
    source.connect(gainNode);
    deps.connectHit(gainNode);
    source.start(0);
    previewSource = source;
    source.onended = () => {
      if (previewSource === source) previewSource = null;
    };
    deps.pulseViz?.();
  } catch {
    /* ignore preview errors */
  }
}
