/**
 * Master output bus — all hits route through analyser for the visualizer.
 * Volume lives on masterGain so each hit skips createGain (lower mobile latency).
 */

/** @type {GainNode | null} */
let masterGain = null;

/** @type {AnalyserNode | null} */
let analyser = null;

/**
 * @param {AudioContext} audioCtx
 */
export function initAudioBus(audioCtx) {
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1;

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -10;

  masterGain.connect(analyser);
  analyser.connect(audioCtx.destination);

  return { masterGain, analyser };
}

/** @param {AudioNode} node */
export function connectHitToOutput(node) {
  if (!masterGain) return;
  node.connect(masterGain);
}

/** @param {number} value 0..1 */
export function setMasterVolume(value) {
  if (!masterGain) return;
  masterGain.gain.value = Math.min(1, Math.max(0, value));
}

export function getAnalyser() {
  return analyser;
}

export function getMasterGain() {
  return masterGain;
}
