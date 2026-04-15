import { SCENES } from './renderers/registry';
import { setLandmarkSmoothing } from './mediapipe';
import { setRmsSmoothing } from './audio';

const LS = 'pendulum.tuning.';

function loadBool(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(LS + key);
  return v !== null ? v === 'true' : fallback;
}

export const config = {
  audioGain: load('audioGain', 4),
  smoothing: load('smoothing', 0.8),
  impulseDecay: load('impulseDecay', 250),
  poseGain: load('poseGain', 40),
  sceneOverride: loadStr('sceneOverride') as string | null,
  // Posture toggles
  poseStates: loadBool('poseStates', true),
  poseContinuous: loadBool('poseContinuous', true),
  poseCentroid: loadBool('poseCentroid', true),
  faceMouth: loadBool('faceMouth', true),
  faceBrows: loadBool('faceBrows', true),
  faceEyes: loadBool('faceEyes', true),
  faceSmile: loadBool('faceSmile', true),
  faceHeadPose: loadBool('faceHeadPose', true),
  poseTriangle: loadBool('poseTriangle', true),
  // Scene-tuning knobs (uncertain — need live projector feedback to set well)
  particleVelScale: load('particleVelScale', 80),    // debrisField: how hard keypoint motion flings new particles
  particleViewScale: load('particleViewScale', 1.0), // debrisField: world-space size that pose coords map to
  bodyLinesDropoutMs: load('bodyLinesDropoutMs', 500), // bodyLines: ms a performer's ribbons linger after pose loss
  faceCamStrength: load('faceCamStrength', 0.5),   // debrisField: how much face.yaw/pitch orbits the camera (0..1)
  // One-euro smoothing (see filters/one-euro.ts). mincutoff = heavier at
  // rest when lower; beta = faster response on motion when higher.
  lmMincutoff: load('lmMincutoff', 1.0),   // landmarks
  lmBeta:      load('lmBeta', 0.01),
  rmsMincutoff: load('rmsMincutoff', 1.0), // audio.rms
  rmsBeta:      load('rmsBeta', 2.0),
};

function load(key: string, fallback: number): number {
  const v = localStorage.getItem(LS + key);
  return v !== null ? Number(v) : fallback;
}

function loadStr(key: string): string | null {
  return localStorage.getItem(LS + key) || null;
}

function save(key: string, value: number | string | null) {
  if (value === null || value === '') localStorage.removeItem(LS + key);
  else localStorage.setItem(LS + key, String(value));
}

export function installSettings() {
  const panel = document.getElementById('settings')!;

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
      document.body.classList.toggle('settings');
    }
  });

  const modeOpts = SCENES.map(m => `<option value="${m}">${m}</option>`).join('');

  panel.innerHTML = `
    <h3>rehearsal</h3>
    <label>Scene
      <select id="t-scene">
        <option value="">(phone control)</option>
        ${modeOpts}
      </select>
    </label>
    <label>Audio gain
      <span class="t-val" id="t-ag-v">${config.audioGain.toFixed(1)}×</span>
      <input id="t-ag" type="range" min="1" max="10" step="0.5" value="${config.audioGain}" />
    </label>
    <label>Smoothing α
      <span class="t-val" id="t-sm-v">${config.smoothing.toFixed(2)}</span>
      <input id="t-sm" type="range" min="0" max="0.99" step="0.01" value="${config.smoothing}" />
    </label>
    <label>Impulse decay
      <span class="t-val" id="t-id-v">${config.impulseDecay}ms</span>
      <input id="t-id" type="range" min="50" max="1000" step="10" value="${config.impulseDecay}" />
    </label>
    <label>Pose gain
      <span class="t-val" id="t-pg-v">${config.poseGain}</span>
      <input id="t-pg" type="range" min="5" max="100" step="1" value="${config.poseGain}" />
    </label>
    <div class="t-row">
      <button id="t-reset">reset all</button>
    </div>
    <div class="t-collapse" id="t-scenetune">
      <div class="t-collapse-header" id="t-scenetune-hdr">&#9654; Scene tuning</div>
      <div class="t-collapse-body" id="t-scenetune-body" style="display:none">
        <div class="t-group-label">debrisField</div>
        <label>Keypoint velocity scale
          <span class="t-val" id="t-pvs-v">${config.particleVelScale}</span>
          <input id="t-pvs" type="range" min="0" max="200" step="5" value="${config.particleVelScale}" />
        </label>
        <label>View scale
          <span class="t-val" id="t-pvw-v">${config.particleViewScale.toFixed(2)}×</span>
          <input id="t-pvw" type="range" min="0.3" max="2.0" step="0.05" value="${config.particleViewScale}" />
        </label>
        <div class="t-group-label">bodyLines</div>
        <label>Dropout persistence
          <span class="t-val" id="t-bld-v">${config.bodyLinesDropoutMs}ms</span>
          <input id="t-bld" type="range" min="0" max="2000" step="50" value="${config.bodyLinesDropoutMs}" />
        </label>
        <div class="t-group-label">Face-driven camera (debrisField)</div>
        <label>Face cam strength
          <span class="t-val" id="t-fcs-v">${(config.faceCamStrength * 100).toFixed(0)}%</span>
          <input id="t-fcs" type="range" min="0" max="1" step="0.05" value="${config.faceCamStrength}" />
        </label>
        <div class="t-group-label">Landmark smoothing (one-euro)</div>
        <label>Min cutoff
          <span class="t-val" id="t-lmc-v">${config.lmMincutoff.toFixed(2)} Hz</span>
          <input id="t-lmc" type="range" min="0.1" max="5.0" step="0.05" value="${config.lmMincutoff}" />
        </label>
        <label>Beta
          <span class="t-val" id="t-lmb-v">${config.lmBeta.toFixed(3)}</span>
          <input id="t-lmb" type="range" min="0" max="0.2" step="0.005" value="${config.lmBeta}" />
        </label>
        <div class="t-group-label">Audio RMS smoothing (one-euro)</div>
        <label>Min cutoff
          <span class="t-val" id="t-rmc-v">${config.rmsMincutoff.toFixed(2)} Hz</span>
          <input id="t-rmc" type="range" min="0.1" max="5.0" step="0.05" value="${config.rmsMincutoff}" />
        </label>
        <label>Beta
          <span class="t-val" id="t-rmb-v">${config.rmsBeta.toFixed(2)}</span>
          <input id="t-rmb" type="range" min="0" max="10" step="0.1" value="${config.rmsBeta}" />
        </label>
      </div>
    </div>
    <div class="t-collapse" id="t-posture">
      <div class="t-collapse-header" id="t-posture-hdr">&#9654; Posture</div>
      <div class="t-collapse-body" id="t-posture-body">
        <div class="t-group-label">Pose tracking</div>
        <label class="t-toggle"><input type="checkbox" id="t-poseStates" ${config.poseStates ? 'checked' : ''} /> Pose states</label>
        <label class="t-toggle"><input type="checkbox" id="t-poseContinuous" ${config.poseContinuous ? 'checked' : ''} /> Continuous motion</label>
        <label class="t-toggle"><input type="checkbox" id="t-poseCentroid" ${config.poseCentroid ? 'checked' : ''} /> Body centroid</label>
        <div class="t-group-label">Face tracking</div>
        <label class="t-toggle"><input type="checkbox" id="t-faceMouth" ${config.faceMouth ? 'checked' : ''} /> Mouth</label>
        <label class="t-toggle"><input type="checkbox" id="t-faceBrows" ${config.faceBrows ? 'checked' : ''} /> Brows</label>
        <label class="t-toggle"><input type="checkbox" id="t-faceEyes" ${config.faceEyes ? 'checked' : ''} /> Eyes</label>
        <label class="t-toggle"><input type="checkbox" id="t-faceSmile" ${config.faceSmile ? 'checked' : ''} /> Smile</label>
        <label class="t-toggle"><input type="checkbox" id="t-faceHeadPose" ${config.faceHeadPose ? 'checked' : ''} /> Head pose (yaw/pitch)</label>
        <div class="t-group-label">Raw data</div>
        <label class="t-toggle"><input type="checkbox" id="t-poseTriangle" ${config.poseTriangle ? 'checked' : ''} /> Triangle distances</label>
      </div>
    </div>
    <div class="t-hint">press <kbd>s</kbd> to close · <kbd>d</kbd> debug · <kbd>m</kbd> skeleton · <kbd>f</kbd> fullscreen</div>
  `;

  const scene = panel.querySelector<HTMLSelectElement>('#t-scene')!;
  const ag = panel.querySelector<HTMLInputElement>('#t-ag')!;
  const sm = panel.querySelector<HTMLInputElement>('#t-sm')!;
  const id = panel.querySelector<HTMLInputElement>('#t-id')!;
  const pg = panel.querySelector<HTMLInputElement>('#t-pg')!;

  scene.value = config.sceneOverride ?? '';

  function bind(input: HTMLInputElement, key: keyof typeof config, labelId: string, fmt: (v: number) => string) {
    input.oninput = () => {
      const v = Number(input.value);
      (config as any)[key] = v;
      save(key, v);
      panel.querySelector<HTMLSpanElement>(labelId)!.textContent = fmt(v);
    };
  }

  bind(ag, 'audioGain', '#t-ag-v', v => `${v.toFixed(1)}×`);
  bind(sm, 'smoothing', '#t-sm-v', v => v.toFixed(2));
  bind(id, 'impulseDecay', '#t-id-v', v => `${v}ms`);
  bind(pg, 'poseGain', '#t-pg-v', v => `${v}`);

  // Scene tuning knobs
  const pvs = panel.querySelector<HTMLInputElement>('#t-pvs')!;
  const pvw = panel.querySelector<HTMLInputElement>('#t-pvw')!;
  const bld = panel.querySelector<HTMLInputElement>('#t-bld')!;
  bind(pvs, 'particleVelScale', '#t-pvs-v', v => `${v}`);
  bind(pvw, 'particleViewScale', '#t-pvw-v', v => `${v.toFixed(2)}×`);
  bind(bld, 'bodyLinesDropoutMs', '#t-bld-v', v => `${v}ms`);
  const fcs = panel.querySelector<HTMLInputElement>('#t-fcs')!;
  bind(fcs, 'faceCamStrength', '#t-fcs-v', v => `${(v * 100).toFixed(0)}%`);

  // One-euro smoothing sliders — push through to the live filters on
  // every change so tuning is audible/visible without reload.
  const lmc = panel.querySelector<HTMLInputElement>('#t-lmc')!;
  const lmb = panel.querySelector<HTMLInputElement>('#t-lmb')!;
  const rmc = panel.querySelector<HTMLInputElement>('#t-rmc')!;
  const rmb = panel.querySelector<HTMLInputElement>('#t-rmb')!;
  const pushLandmark = () => setLandmarkSmoothing(config.lmMincutoff, config.lmBeta);
  const pushRms = () => setRmsSmoothing(config.rmsMincutoff, config.rmsBeta);
  bindThen(lmc, 'lmMincutoff', '#t-lmc-v', v => `${v.toFixed(2)} Hz`, pushLandmark);
  bindThen(lmb, 'lmBeta',      '#t-lmb-v', v => v.toFixed(3),         pushLandmark);
  bindThen(rmc, 'rmsMincutoff', '#t-rmc-v', v => `${v.toFixed(2)} Hz`, pushRms);
  bindThen(rmb, 'rmsBeta',      '#t-rmb-v', v => v.toFixed(2),         pushRms);
  // Apply persisted values on install so a reload honours last session.
  pushLandmark();
  pushRms();

  function bindThen(input: HTMLInputElement, key: keyof typeof config, labelId: string, fmt: (v: number) => string, after: () => void) {
    input.oninput = () => {
      const v = Number(input.value);
      (config as any)[key] = v;
      save(key, v);
      panel.querySelector<HTMLSpanElement>(labelId)!.textContent = fmt(v);
      after();
    };
  }

  scene.onchange = () => {
    const v = scene.value;
    config.sceneOverride = v || null;
    save('sceneOverride', v || null);
  };

  panel.querySelector<HTMLButtonElement>('#t-reset')!.onclick = () => {
    localStorage.clear();
    location.reload();
  };

  // ---- Collapsible sections ----
  function wireCollapse(hdrId: string, bodyId: string, label: string) {
    const hdr = panel.querySelector<HTMLDivElement>(hdrId)!;
    const body = panel.querySelector<HTMLDivElement>(bodyId)!;
    hdr.onclick = () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      hdr.innerHTML = (open ? '&#9654; ' : '&#9660; ') + label;
    };
  }
  wireCollapse('#t-posture-hdr', '#t-posture-body', 'Posture');
  wireCollapse('#t-scenetune-hdr', '#t-scenetune-body', 'Scene tuning');

  // Posture toggles
  const toggleKeys: (keyof typeof config)[] = [
    'poseStates', 'poseContinuous', 'poseCentroid',
    'faceMouth', 'faceBrows', 'faceEyes', 'faceSmile', 'faceHeadPose',
    'poseTriangle',
  ];
  for (const key of toggleKeys) {
    const cb = panel.querySelector<HTMLInputElement>(`#t-${key}`)!;
    cb.onchange = () => {
      (config as any)[key] = cb.checked;
      save(key, cb.checked ? 'true' : 'false');
    };
  }
}
