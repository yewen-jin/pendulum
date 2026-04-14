import { FilesetResolver, PoseLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import { set, get } from './bus';
import { config } from './settings';
import { PoseStateTracker, POSE_STATES } from './pose-states';

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

// Aggregate face signal keys (no performer tag) that scenes read
const FACE_AGG_KEYS = ['face.mouthOpen', 'face.browUp', 'face.browDown', 'face.eyeSquint', 'face.smile'] as const;

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
    'position:fixed;bottom:8px;left:8px;right:8px;display:none;' +
    'pointer-events:none;z-index:900;' +
    'display:flex;justify-content:space-between;align-items:flex-end;';
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
  readonly tag: string;
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
    // p2 appears on the left side, p1 on the right (flex order)
    this.debugWrap.style.order = this.tag === 'p1' ? '2' : '1';

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

export function stopPose() {
  for (const [tag, tracker] of trackers) {
    tracker.stop();
    trackers.delete(tag);
  }
  // Clean up the shared debug container
  debugContainer?.remove();
  debugContainer = null;
}
