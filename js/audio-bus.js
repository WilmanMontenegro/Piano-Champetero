/**
 * Master output bus — all hits route through analyser for the visualizer.
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

/** @param {GainNode} gainNode */
export function connectHitToOutput(gainNode) {
  if (!masterGain) return;
  gainNode.connect(masterGain);
}

export function getAnalyser() {
  return analyser;
}

export function getMasterGain() {
  return masterGain;
}
