import { FilesetResolver, PoseLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import { set, get } from './bus';
import { config } from './settings';
import { PoseStateTracker, POSE_STATES } from './pose-states';
import { LandmarkSmoother } from './filters/one-euro';

// Landmark smoother params. mincutoff=1.0 Hz gives ~160ms of smoothing
// when a performer is still (kills the tracker's 30fps jitter); beta=0.01
// is gentle so slow drifts smooth out but fast gestures still get through
// with minimal lag. Mutable so the settings panel can retune live, and
// so trackers started *after* a slider change inherit the latest values.
let lmMincutoff = 1.0;
let lmBeta = 0.01;
const POSE_LANDMARK_COUNT = 33; // MediaPipe full body

// Upper-body landmark count: indices 0–16 cover nose, eyes, ears,
// shoulders, elbows, and wrists — everything visible in chest-up framing.
// Lower-body landmarks (17–32) are excluded from motion/centroid calculations
// because MediaPipe hallucinates their positions when legs are off-screen.
const UPPER_BODY = 17;

// Blendshape names we extract and their bus key suffixes
const FACE_BLENDSHAPE_MAP: [string, string][] = [
  ['jawOpen', 'mouthOpen'],
  ['browInnerUp', 'browUp'],
  ['eyeSquintLeft', '_eyeSquintL'],   // internal, averaged below
  ['eyeSquintRight', '_eyeSquintR'],  // internal, averaged below
  ['mouthSmileLeft', '_smileL'],      // internal, averaged below
  ['mouthSmileRight', '_smileR'],     // internal, averaged below
  ['browDownLeft', '_browDownL'],     // internal, averaged below
  ['browDownRight', '_browDownR'],    // internal, averaged below
];

// Names of blendshapes we need to look up (flat set for fast membership check)
const NEEDED_BLENDSHAPES = new Set(FACE_BLENDSHAPE_MAP.map(([name]) => name));

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],
  [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[31,27],
  [28,30],[30,32],[32,28],[15,17],[15,19],[15,21],[16,18],[16,20],[16,22],
];

// Aggregate face signal keys (no performer tag) that scenes read.
// Unsigned [0,1] expression scores → max across performers.
const FACE_AGG_KEYS = ['face.mouthOpen', 'face.browUp', 'face.browDown', 'face.eyeSquint', 'face.smile'] as const;
// Signed [-1,1] head-pose angles → max-by-absolute-value across performers
// (so a signed value with the largest magnitude wins, regardless of sign).
const FACE_AGG_KEYS_SIGNED = ['face.yaw', 'face.pitch', 'face.roll'] as const;

// Normalisation constant: ±π/4 (45°) maps to ±1 on the bus.
const HEAD_POSE_RANGE = Math.PI / 4;

function clampSigned(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

// ---- Module-level registry of active trackers ----
const trackers = new Map<string, PoseTracker>();
let showSkeleton = false;
let debugContainer: HTMLDivElement | null = null;
let keyListenerInstalled = false;

// Cache the vision fileset so we only load it once even with two trackers
let visionPromise: Promise<any> | null = null;
function getVision() {
  if (!visionPromise) {
    visionPromise = FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
  }
  return visionPromise;
}

// ---- Debug overlay container (shared) ----

function ensureDebugContainer() {
  if (debugContainer) return;

  debugContainer = document.createElement('div');
  debugContainer.id = 'pose-debug-container';
  debugContainer.style.cssText =
    'position:fixed;bottom:8px;right:8px;' +
    'pointer-events:none;z-index:900;' +
    'display:flex;flex-direction:column;gap:4px;';
  // Start hidden
  debugContainer.style.display = 'none';
  document.body.appendChild(debugContainer);

  if (!keyListenerInstalled) {
    keyListenerInstalled = true;
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'm') {
        showSkeleton = !showSkeleton;
        if (debugContainer) {
          debugContainer.style.display = showSkeleton ? 'flex' : 'none';
        }
      }
    });
  }
}

// ---- Per-performer tracker ----

class PoseTracker {
  // Smoothed landmarks for scene anchoring — one-euro filtered so
  // static poses don't jitter and fast gestures still read through.
  lastSmoothed: { x: number; y: number; z?: number }[] | null = null;
  private smoother = new LandmarkSmoother(POSE_LANDMARK_COUNT, lmMincutoff, lmBeta);

  configureSmoother(mincutoff: number, beta: number): void {
    this.smoother.configure(mincutoff, beta);
  }
  readonly tag: string;
  lastLandmarks: { x: number; y: number; z?: number }[] | null = null;
  private landmarker: PoseLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private prevLandmarks: { x: number; y: number }[] | null = null;
  private poseState: PoseStateTracker;

  // Debug overlay elements
  private debugWrap: HTMLDivElement | null = null;
  private debugCanvas: HTMLCanvasElement | null = null;
  private debugCtx: CanvasRenderingContext2D | null = null;

  constructor(tag: string) {
    this.tag = tag;
    this.poseState = new PoseStateTracker(tag);
  }

  async start(deviceId: string) {
    this.initDebugPanel();

    const vision = await getVision();
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });

    // Create FaceLandmarker alongside PoseLandmarker. If it fails (e.g. GPU
    // delegate issue, model fetch failure), log a warning but keep pose running.
    try {
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      console.log(`[mediapipe:${this.tag}] FaceLandmarker ready`);
    } catch (err) {
      console.warn(`[mediapipe:${this.tag}] FaceLandmarker init failed — face signals unavailable:`, err);
      this.faceLandmarker = null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: 640, height: 480 },
    });
    this.video = document.createElement('video');
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    this.loop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    if (this.video?.srcObject) {
      (this.video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    this.landmarker?.close();
    this.landmarker = null;
    this.faceLandmarker?.close();
    this.faceLandmarker = null;
    this.video = null;
    this.prevLandmarks = null;
    this.lastLandmarks = null;
    this.lastSmoothed = null;
    this.smoother.reset();
    // Remove debug panel
    this.debugWrap?.remove();
    this.debugWrap = null;
    this.debugCanvas = null;
    this.debugCtx = null;
  }

  // ---- Debug overlay (per-performer panel) ----

  private initDebugPanel() {
    ensureDebugContainer();

    this.debugWrap = document.createElement('div');
    this.debugWrap.style.cssText =
      'border:1px solid #0f06;border-radius:4px;overflow:hidden;';

    this.debugCanvas = document.createElement('canvas');
    this.debugCanvas.width = 320;
    this.debugCanvas.height = 240;
    this.debugCanvas.style.cssText = 'display:block;background:#000;';
    this.debugCtx = this.debugCanvas.getContext('2d')!;

    // Tag label
    const label = document.createElement('div');
    label.style.cssText =
      'position:absolute;top:4px;left:4px;color:#0f0;font:bold 11px ui-monospace,monospace;' +
      'background:#0008;padding:1px 4px;border-radius:2px;pointer-events:none;';
    label.textContent = this.tag;

    const inner = document.createElement('div');
    inner.style.cssText = 'position:relative;';
    inner.appendChild(this.debugCanvas);
    inner.appendChild(label);

    this.debugWrap.appendChild(inner);
    debugContainer!.appendChild(this.debugWrap);
  }

  private drawSkeleton(
    lm: { x: number; y: number; z?: number }[],
    faceLm?: { x: number; y: number; z?: number }[]
  ) {
    if (!this.debugCtx || !this.debugCanvas || !this.video) return;
    const w = this.debugCanvas.width, h = this.debugCanvas.height;

    this.debugCtx.clearRect(0, 0, w, h);
    this.debugCtx.drawImage(this.video, 0, 0, w, h);

    this.debugCtx.strokeStyle = '#0f0';
    this.debugCtx.lineWidth = 2;
    for (const [a, b] of CONNECTIONS) {
      if (!lm[a] || !lm[b]) continue;
      this.debugCtx.beginPath();
      this.debugCtx.moveTo(lm[a].x * w, lm[a].y * h);
      this.debugCtx.lineTo(lm[b].x * w, lm[b].y * h);
      this.debugCtx.stroke();
    }

    this.debugCtx.fillStyle = '#0f0';
    for (const p of lm) {
      this.debugCtx.beginPath();
      this.debugCtx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
      this.debugCtx.fill();
    }

    // Draw face landmarks as small cyan dots when available
    if (faceLm) {
      this.debugCtx.fillStyle = '#0ff';
      for (const p of faceLm) {
        this.debugCtx.beginPath();
        this.debugCtx.arc(p.x * w, p.y * h, 1.5, 0, Math.PI * 2);
        this.debugCtx.fill();
      }
    }
  }

  // ---- Per-frame loop ----

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.landmarker || !this.video) return;
    const ts = performance.now();
    const res = this.landmarker.detectForVideo(this.video, ts);
    if (!res.landmarks?.[0]) return;
    const lm = res.landmarks[0];
    this.lastLandmarks = lm;
    this.lastSmoothed = this.smoother.apply(lm, ts / 1000);

    // ---- Face detection (same frame, same video element) ----
    let faceLm: { x: number; y: number; z?: number }[] | undefined;
    if (this.faceLandmarker) {
      try {
        const faceRes = this.faceLandmarker.detectForVideo(this.video, ts);
        if (faceRes.faceLandmarks?.[0]) {
          faceLm = faceRes.faceLandmarks[0];
        }
        if (faceRes.faceBlendshapes?.[0]) {
          this.processFaceBlendshapes(faceRes.faceBlendshapes[0].categories);
        }
        const mat = faceRes.facialTransformationMatrixes?.[0];
        if (mat) {
          this.processFaceTransformationMatrix(mat.data);
        }
      } catch {
        // Silently ignore per-frame face detection errors
      }
    }

    if (showSkeleton) this.drawSkeleton(lm, faceLm);

    let motion = 0;
    if (this.prevLandmarks) {
      let acc = 0;
      for (let i = 0; i < UPPER_BODY; i++) {
        const dx = lm[i].x - this.prevLandmarks[i].x;
        const dy = lm[i].y - this.prevLandmarks[i].y;
        acc += Math.hypot(dx, dy);
      }
      motion = Math.min(1, (acc / UPPER_BODY) * config.poseGain);
    }
    this.prevLandmarks = lm.map(p => ({ x: p.x, y: p.y }));

    const lw = lm[15], rw = lm[16];
    const openness = lw && rw ? Math.min(1, Math.hypot(lw.x - rw.x, lw.y - rw.y) * 1.2) : 0;

    let cx = 0;
    for (let i = 0; i < UPPER_BODY; i++) cx += lm[i].x;
    cx /= UPPER_BODY;

    if (config.poseContinuous) {
      set(`pose.${this.tag}.motion`, motion);
      set(`pose.${this.tag}.openness`, openness);
    }

    if (config.poseCentroid) {
      set(`pose.${this.tag}.cx`, cx);
    }

    // Per-performer pose state
    const stateValues = this.poseState.update(lm);

    // ---- Write aggregate keys (max across all active trackers) ----
    this.writeAggregates(motion, openness, stateValues);
  };

  private processFaceBlendshapes(categories: { categoryName: string; score: number }[]) {
    // Build a quick lookup from the returned categories
    const scores: Record<string, number> = {};
    for (const cat of categories) {
      if (NEEDED_BLENDSHAPES.has(cat.categoryName)) {
        scores[cat.categoryName] = cat.score;
      }
    }

    // Direct mappings
    const mouthOpen = scores['jawOpen'] ?? 0;
    const browUp = scores['browInnerUp'] ?? 0;

    // Averaged L/R mappings
    const eyeSquint = ((scores['eyeSquintLeft'] ?? 0) + (scores['eyeSquintRight'] ?? 0)) * 0.5;
    const smile = ((scores['mouthSmileLeft'] ?? 0) + (scores['mouthSmileRight'] ?? 0)) * 0.5;
    const browDown = ((scores['browDownLeft'] ?? 0) + (scores['browDownRight'] ?? 0)) * 0.5;

    // Per-performer keys, gated by posture toggles
    if (config.faceMouth) {
      set(`face.${this.tag}.mouthOpen`, mouthOpen);
    }
    if (config.faceBrows) {
      set(`face.${this.tag}.browUp`, browUp);
      set(`face.${this.tag}.browDown`, browDown);
    }
    if (config.faceEyes) {
      set(`face.${this.tag}.eyeSquint`, eyeSquint);
    }
    if (config.faceSmile) {
      set(`face.${this.tag}.smile`, smile);
    }

    // Aggregate face keys: max across all active trackers
    this.writeFaceAggregates();
  }

  private writeFaceAggregates() {
    for (const aggKey of FACE_AGG_KEYS) {
      // e.g. 'face.mouthOpen' -> suffix is 'mouthOpen'
      const suffix = aggKey.slice(5); // strip 'face.'
      let best = 0;
      for (const [, tracker] of trackers) {
        const v = get(`face.${tracker.tag}.${suffix}`);
        if (v > best) best = v;
      }
      // Gate by the appropriate config toggle
      const gated = this.isFaceKeyGated(suffix);
      if (gated) set(aggKey, best);
    }
    // Signed head-pose aggregates: pick the value with the largest absolute
    // magnitude across performers (for a single performer this is passthrough).
    if (config.faceHeadPose) {
      for (const aggKey of FACE_AGG_KEYS_SIGNED) {
        const suffix = aggKey.slice(5);
        let best = 0;
        for (const [, tracker] of trackers) {
          const v = get(`face.${tracker.tag}.${suffix}`);
          if (Math.abs(v) > Math.abs(best)) best = v;
        }
        set(aggKey, best, 0.85);
      }
    }
  }

  /** Extract yaw / pitch / roll from MediaPipe's facial transformation
   *  4×4 (column-major). Normalised so ±π/4 maps to ±1, then clamped. */
  private processFaceTransformationMatrix(data: Float32Array | number[]) {
    if (!config.faceHeadPose) return;
    // Column-major: m[col*4 + row]. We need rows 0..2 of the 3×3 rotation block.
    const m02 = data[8],  m12 = data[9],  m22 = data[10];
    const m10 = data[1],  m11 = data[5];
    const yaw   = Math.atan2(m02, m22);                          // around Y
    const pitch = Math.asin(-Math.max(-1, Math.min(1, m12)));    // around X
    const roll  = Math.atan2(m10, m11);                          // around Z
    set(`face.${this.tag}.yaw`,   clampSigned(yaw   / HEAD_POSE_RANGE), 0.85);
    set(`face.${this.tag}.pitch`, clampSigned(pitch / HEAD_POSE_RANGE), 0.85);
    set(`face.${this.tag}.roll`,  clampSigned(roll  / HEAD_POSE_RANGE), 0.85);
  }

  private isFaceKeyGated(suffix: string): boolean {
    if (suffix === 'mouthOpen') return config.faceMouth;
    if (suffix === 'browUp' || suffix === 'browDown') return config.faceBrows;
    if (suffix === 'eyeSquint') return config.faceEyes;
    if (suffix === 'smile') return config.faceSmile;
    return true;
  }

  private writeAggregates(
    motion: number,
    openness: number,
    stateValues: Record<string, number> | null,
  ) {
    if (config.poseContinuous) {
      // Max motion/openness across all active trackers
      let bestMotion = motion;
      let bestOpenness = openness;
      for (const [tag, ] of trackers) {
        if (tag === this.tag) continue;
        const m = get(`pose.${tag}.motion`);
        const o = get(`pose.${tag}.openness`);
        if (m > bestMotion) bestMotion = m;
        if (o > bestOpenness) bestOpenness = o;
      }
      set('pose.motion', bestMotion);
      set('pose.openness', bestOpenness);
    }

    if (stateValues) {
      // Max of each pose state across all active trackers
      for (const state of POSE_STATES) {
        let best = stateValues[state];
        for (const [tag, ] of trackers) {
          if (tag === this.tag) continue;
          const v = get(`pose.state.${tag}.${state}`);
          if (v > best) best = v;
        }
        set(`pose.state.${state}`, best, 0);
      }
    }
  }
}

// ---- Public API ----

export async function startPose(deviceId: string, tag = 'p1') {
  // Stop existing tracker for this tag if any
  const existing = trackers.get(tag);
  if (existing) existing.stop();

  const tracker = new PoseTracker(tag);
  trackers.set(tag, tracker);
  await tracker.start(deviceId);
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs.filter(d => d.kind === 'videoinput');
}

/** Returns the most recent **raw** landmarks for a performer, or null
 *  if no pose has been detected yet. Coordinates are in MediaPipe's
 *  [0,1] normalised space (x=left→right, y=top→bottom, origin top-left).
 *
 *  ⚠ These are unfiltered — they jitter at the tracker's natural noise
 *  floor (~1–2 px equivalent at 30 fps). Use this for the skeleton
 *  overlay (where honesty matters) or for motion/velocity derivatives
 *  that want the full signal. Scenes that anchor visuals to a body
 *  position should use `getKeypointsSmoothed()` instead. */
export function getKeypoints(tag: string): { x: number; y: number; z?: number }[] | null {
  return trackers.get(tag)?.lastLandmarks ?? null;
}

/** Returns one-euro-filtered landmarks for a performer. Same coordinate
 *  space as `getKeypoints` but with adaptive smoothing: heavy at rest
 *  (no jitter on held poses) and light on fast motion (no lag on
 *  gestures). Prefer this for any scene that anchors geometry to a
 *  body position. */
export function getKeypointsSmoothed(tag: string): { x: number; y: number; z?: number }[] | null {
  return trackers.get(tag)?.lastSmoothed ?? null;
}

/** Retune every active tracker's landmark smoother. Called from the
 *  settings panel when the user slides the cutoff/beta knobs. */
export function setLandmarkSmoothing(mincutoff: number, beta: number): void {
  lmMincutoff = mincutoff;
  lmBeta = beta;
  for (const t of trackers.values()) t.configureSmoother(mincutoff, beta);
}

/** Returns the tags of all currently active performers (e.g. ['p1', 'p2']). */
export function getActiveTags(): string[] {
  return [...trackers.keys()];
}

export function stopPose() {
  for (const [tag, tracker] of trackers) {
    tracker.stop();
    trackers.delete(tag);
  }
  // Clean up the shared debug container
  debugContainer?.remove();
  debugContainer = null;
}
