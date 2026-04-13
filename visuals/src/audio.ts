// Web Audio analysis of the Nord line-in.
// Picks the user-selected input device, runs a single AnalyserNode,
// derives RMS / spectral centroid / onset, and pushes them onto the bus.

import { set, trigger } from './bus';

const FFT = 2048;
const ONSET_ALPHA = 0.85;   // slow envelope for onset baseline
const ONSET_RATIO = 1.6;    // fast/slow ratio to fire an onset

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let stream: MediaStream | null = null;
let raf = 0;
let slowEnv = 0, fastEnv = 0;

export async function startAudio(deviceId?: string) {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId
      ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  ctx = new AudioContext({ latencyHint: 'interactive' });
  const src = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = FFT;
  analyser.smoothingTimeConstant = 0.2;
  src.connect(analyser);
  loop();
  return ctx.sampleRate;
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (!analyser || !ctx) return;

  const td = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(td);
  let sum = 0;
  for (let i = 0; i < td.length; i++) sum += td[i] * td[i];
  const rms = Math.sqrt(sum / td.length);             // 0..~1

  const fd = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(fd);                 // dB
  // Centroid from magnitude (convert dB -> linear, weighted by bin index).
  let mag = 0, wmag = 0;
  for (let i = 1; i < fd.length; i++) {
    const m = Math.pow(10, fd[i] / 20);
    mag += m;
    wmag += m * i;
  }
  const centroidBin = mag > 0 ? wmag / mag : 0;
  const nyquist = ctx.sampleRate / 2;
  const centroidHz = (centroidBin / fd.length) * nyquist;
  // Map 200..6000Hz -> 0..1 (perceptual-ish clamp for typical synth range)
  const centroid = Math.min(1, Math.max(0, (centroidHz - 200) / 5800));

  // Onset detection: fast env over slow env
  fastEnv = Math.max(rms, fastEnv * 0.7);
  slowEnv = slowEnv * ONSET_ALPHA + rms * (1 - ONSET_ALPHA);
  if (slowEnv > 0.002 && fastEnv > slowEnv * ONSET_RATIO) {
    trigger('audio.onset');
    fastEnv = 0;
  }

  set('audio.rms', Math.min(1, rms * 4));    // boost — line-in often quiet
  set('audio.centroid', centroid, 0.85);
}

export function stopAudio() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach(t => t.stop());
  ctx?.close();
  ctx = null; analyser = null; stream = null;
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs.filter(d => d.kind === 'audioinput');
}
