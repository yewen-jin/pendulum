import { FilesetResolver, PoseLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import { set } from './bus';
import { config } from './settings';
import { updatePoseState } from './pose-states';

let landmarker: PoseLandmarker | null = null;
let faceLandmarker: FaceLandmarker | null = null;
let video: HTMLVideoElement | null = null;
let raf = 0;
let prevLandmarks: { x: number; y: number }[] | null = null;
let performerTag = 'p1';

let debugCanvas: HTMLCanvasElement | null = null;
let debugCtx: CanvasRenderingContext2D | null = null;
let showSkeleton = false;

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

function initDebugOverlay() {
  const wrap = document.createElement('div');
  wrap.id = 'pose-debug';
  wrap.style.cssText = 'position:fixed;bottom:8px;right:8px;display:none;border:1px solid #0f06;border-radius:4px;overflow:hidden;';

  debugCanvas = document.createElement('canvas');
  debugCanvas.width = 320;
  debugCanvas.height = 240;
  debugCanvas.style.cssText = 'display:block;background:#000;';
  debugCtx = debugCanvas.getContext('2d')!;

  wrap.appendChild(debugCanvas);
  document.body.appendChild(wrap);

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === 'm') {
      showSkeleton = !showSkeleton;
      wrap.style.display = showSkeleton ? 'block' : 'none';
    }
  });
}

function drawSkeleton(
  lm: { x: number; y: number; z?: number }[],
  faceLm?: { x: number; y: number; z?: number }[]
) {
  if (!debugCtx || !debugCanvas || !video) return;
  const w = debugCanvas.width, h = debugCanvas.height;

  debugCtx.clearRect(0, 0, w, h);
  debugCtx.drawImage(video, 0, 0, w, h);

  debugCtx.strokeStyle = '#0f0';
  debugCtx.lineWidth = 2;
  for (const [a, b] of CONNECTIONS) {
    if (!lm[a] || !lm[b]) continue;
    debugCtx.beginPath();
    debugCtx.moveTo(lm[a].x * w, lm[a].y * h);
    debugCtx.lineTo(lm[b].x * w, lm[b].y * h);
    debugCtx.stroke();
  }

  debugCtx.fillStyle = '#0f0';
  for (const p of lm) {
    debugCtx.beginPath();
    debugCtx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
    debugCtx.fill();
  }

  // Draw face landmarks as small cyan dots when available
  if (faceLm) {
    debugCtx.fillStyle = '#0ff';
    for (const p of faceLm) {
      debugCtx.beginPath();
      debugCtx.arc(p.x * w, p.y * h, 1.5, 0, Math.PI * 2);
      debugCtx.fill();
    }
  }
}

export async function startPose(deviceId: string, tag = 'p1') {
  performerTag = tag;
  initDebugOverlay();

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  landmarker = await PoseLandmarker.createFromOptions(vision, {
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
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
    console.log('[mediapipe] FaceLandmarker ready');
  } catch (err) {
    console.warn('[mediapipe] FaceLandmarker init failed — face signals unavailable:', err);
    faceLandmarker = null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: deviceId }, width: 640, height: 480 },
  });
  video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  loop();
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (!landmarker || !video) return;
  const ts = performance.now();
  const res = landmarker.detectForVideo(video, ts);
  if (!res.landmarks?.[0]) return;
  const lm = res.landmarks[0];

  // ---- Face detection (same frame, same video element) ----
  let faceLm: { x: number; y: number; z?: number }[] | undefined;
  if (faceLandmarker) {
    try {
      const faceRes = faceLandmarker.detectForVideo(video, ts);
      if (faceRes.faceLandmarks?.[0]) {
        faceLm = faceRes.faceLandmarks[0];
      }
      if (faceRes.faceBlendshapes?.[0]) {
        processFaceBlendshapes(faceRes.faceBlendshapes[0].categories);
      }
    } catch {
      // Silently ignore per-frame face detection errors
    }
  }

  if (showSkeleton) drawSkeleton(lm, faceLm);

  let motion = 0;
  if (prevLandmarks) {
    let acc = 0;
    for (let i = 0; i < lm.length; i++) {
      const dx = lm[i].x - prevLandmarks[i].x;
      const dy = lm[i].y - prevLandmarks[i].y;
      acc += Math.hypot(dx, dy);
    }
    motion = Math.min(1, (acc / lm.length) * config.poseGain);
  }
  prevLandmarks = lm.map(p => ({ x: p.x, y: p.y }));

  const lw = lm[15], rw = lm[16];
  const openness = lw && rw ? Math.min(1, Math.hypot(lw.x - rw.x, lw.y - rw.y) * 1.2) : 0;

  let cx = 0;
  for (const p of lm) cx += p.x;
  cx /= lm.length;

  set(`pose.${performerTag}.motion`, motion);
  set(`pose.${performerTag}.openness`, openness);
  set(`pose.${performerTag}.cx`, cx);

  set('pose.motion', motion);
  set('pose.openness', openness);

  updatePoseState(lm);
}

function processFaceBlendshapes(categories: { categoryName: string; score: number }[]) {
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

  // Per-performer keys
  set(`face.${performerTag}.mouthOpen`, mouthOpen);
  set(`face.${performerTag}.browUp`, browUp);
  set(`face.${performerTag}.eyeSquint`, eyeSquint);
  set(`face.${performerTag}.smile`, smile);
  set(`face.${performerTag}.browDown`, browDown);

  // Aggregate keys (same as performer for single-performer v1)
  set('face.mouthOpen', mouthOpen);
  set('face.browUp', browUp);
  set('face.eyeSquint', eyeSquint);
  set('face.smile', smile);
  set('face.browDown', browDown);
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs.filter(d => d.kind === 'videoinput');
}

export function stopPose() {
  cancelAnimationFrame(raf);
  video?.srcObject && (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
  landmarker?.close();
  landmarker = null;
  faceLandmarker?.close();
  faceLandmarker = null;
  video = null;
  prevLandmarks = null;
}
