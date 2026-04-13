// Boots the visualiser. Order of ops:
//   1. Hydra on the main canvas (1920x1080)
//   2. WS to bridge (OSC passthrough)
//   3. Web Audio on Nord input (user picks device on first load)
//   4. MediaPipe pose on selected camera(s)
//   5. Director loop
//
// First load shows a setup screen to choose audio + video inputs.
// Selections are persisted in localStorage so subsequent loads are silent.

import Hydra from 'hydra-synth';
import { connectBridge, set } from './bus';
import { startAudio, listAudioInputs } from './audio';
import { startPose, listVideoInputs } from './mediapipe';
import { initDirector, tick } from './director';
import { installDebug } from './debug';
import { startMidi } from './midi';
import { installSettings } from './settings';
const LS = {
  audio: 'pendulum.audio',
  cam1: 'pendulum.cam1',
  cam2: 'pendulum.cam2',
};

async function bootHydra() {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  canvas.width = 1920; canvas.height = 1080;
  const h = new Hydra({ canvas, detectAudio: false, makeGlobal: true });
  return h;
}

async function pickDevices(): Promise<{ audioId: string; cam1Id?: string; cam2Id?: string }> {
  // Need permission first to get device labels. Video may not exist (e.g. Mac
  // mini with no built-in camera) — fall back to audio-only probe.
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    probe.getTracks().forEach(t => t.stop());
  } catch {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach(t => t.stop());
    } catch (e) {
      console.warn('[setup] no audio device available', e);
    }
  }

  const audios = await listAudioInputs();
  const cams = await listVideoInputs();

  const saved = {
    audio: localStorage.getItem(LS.audio) || '',
    cam1: localStorage.getItem(LS.cam1) || '',
    cam2: localStorage.getItem(LS.cam2) || '',
  };
  if (saved.audio && audios.find(a => a.deviceId === saved.audio)) {
    return { audioId: saved.audio, cam1Id: saved.cam1 || undefined, cam2Id: saved.cam2 || undefined };
  }

  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:#000;color:#8f8;font:13px ui-monospace,monospace;padding:24px;z-index:999;overflow:auto';
    wrap.innerHTML = `
      <h2>pendulum · setup</h2>
      <label>Nord audio input<br/><select id="a"></select></label><br/><br/>
      <label>Camera — performer 1<br/><select id="c1"><option value="">(none)</option></select></label><br/><br/>
      <label>Camera — performer 2<br/><select id="c2"><option value="">(none)</option></select></label><br/><br/>
      <button id="go" style="padding:8px 16px;background:#0f06;color:#8f8;border:1px solid #0f0;cursor:pointer">start</button>
    `;
    document.body.appendChild(wrap);
    const a = wrap.querySelector<HTMLSelectElement>('#a')!;
    const c1 = wrap.querySelector<HTMLSelectElement>('#c1')!;
    const c2 = wrap.querySelector<HTMLSelectElement>('#c2')!;
    audios.forEach(d => a.add(new Option(d.label || d.deviceId, d.deviceId)));
    cams.forEach(d => {
      c1.add(new Option(d.label || d.deviceId, d.deviceId));
      c2.add(new Option(d.label || d.deviceId, d.deviceId));
    });
    wrap.querySelector<HTMLButtonElement>('#go')!.onclick = () => {
      localStorage.setItem(LS.audio, a.value);
      localStorage.setItem(LS.cam1, c1.value);
      localStorage.setItem(LS.cam2, c2.value);
      wrap.remove();
      resolve({ audioId: a.value, cam1Id: c1.value || undefined, cam2Id: c2.value || undefined });
    };
  });
}

async function main() {
  const h = await bootHydra();
  connectBridge(`ws://${location.hostname || 'localhost'}:9001`);
  initDirector(h);
  installDebug();
  installSettings();

  // Seed a reasonable default so the scene isn't flat on startup
  set('phone.intensity', 0.6);

  const { audioId, cam1Id, cam2Id } = await pickDevices();
  await startAudio(audioId).catch(e => console.warn('[audio] failed', e));
  startMidi();
  if (cam1Id) startPose(cam1Id, 'p1').catch(e => console.warn('[pose1] failed', e));
  if (cam2Id) {
    // Second performer: run the pose loop in a second instance by
    // invoking startPose again with a different tag. Current module
    // uses a single global landmarker — acceptable for v1 (swap to
    // per-tag state when we genuinely need two simultaneous tracks).
    console.warn('[pose] v1 tracks one performer at a time; cam2 ignored');
  }

  function frame() {
    tick();
    requestAnimationFrame(frame);
  }
  frame();
}

main();
