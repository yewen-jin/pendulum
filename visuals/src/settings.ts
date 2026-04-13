import { MODES, type ModeName } from './scenes';

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
  sceneOverride: loadStr('sceneOverride') as ModeName | null,
  // Posture toggles
  poseStates: loadBool('poseStates', true),
  poseContinuous: loadBool('poseContinuous', true),
  poseCentroid: loadBool('poseCentroid', true),
  faceMouth: loadBool('faceMouth', true),
  faceBrows: loadBool('faceBrows', true),
  faceEyes: loadBool('faceEyes', true),
  faceSmile: loadBool('faceSmile', true),
  poseTriangle: loadBool('poseTriangle', true),
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

  const modeOpts = MODES.map(m => `<option value="${m}">${m}</option>`).join('');

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

  scene.onchange = () => {
    const v = scene.value as ModeName | '';
    config.sceneOverride = v || null;
    save('sceneOverride', v || null);
  };

  panel.querySelector<HTMLButtonElement>('#t-reset')!.onclick = () => {
    localStorage.clear();
    location.reload();
  };

  // ---- Collapsible Posture section ----
  const postureHdr = panel.querySelector<HTMLDivElement>('#t-posture-hdr')!;
  const postureBody = panel.querySelector<HTMLDivElement>('#t-posture-body')!;
  postureHdr.onclick = () => {
    const open = postureBody.style.display !== 'none';
    postureBody.style.display = open ? 'none' : 'block';
    postureHdr.innerHTML = open ? '&#9654; Posture' : '&#9660; Posture';
  };

  // Posture toggles
  const toggleKeys: (keyof typeof config)[] = [
    'poseStates', 'poseContinuous', 'poseCentroid',
    'faceMouth', 'faceBrows', 'faceEyes', 'faceSmile',
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
