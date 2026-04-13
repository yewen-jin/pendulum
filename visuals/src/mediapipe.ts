// MediaPipe Tasks (WASM) pose tracking on a chosen camera device.
// Derives body motion + openness signals onto the bus. Face blendshapes
// can be added later with FaceLandmarker in the same pattern.

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { set } from './bus';

let landmarker: PoseLandmarker | null = null;
let video: HTMLVideoElement | null = null;
let raf = 0;
let prevLandmarks: { x: number; y: number }[] | null = null;
let performerTag = 'p1';

export async function startPose(deviceId: string, tag = 'p1') {
  performerTag = tag;
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

  // Motion: mean frame-to-frame displacement of all landmarks.
  let motion = 0;
  if (prevLandmarks) {
    let acc = 0;
    for (let i = 0; i < lm.length; i++) {
      const dx = lm[i].x - prevLandmarks[i].x;
      const dy = lm[i].y - prevLandmarks[i].y;
      acc += Math.hypot(dx, dy);
    }
    motion = Math.min(1, (acc / lm.length) * 40);  // tune gain live
  }
  prevLandmarks = lm.map(p => ({ x: p.x, y: p.y }));

  // Openness: distance between wrists (landmarks 15, 16) normalized.
  const lw = lm[15], rw = lm[16];
  const openness = lw && rw ? Math.min(1, Math.hypot(lw.x - rw.x, lw.y - rw.y) * 1.2) : 0;

  // Centroid X (whole body): drives horizontal camera bias.
  let cx = 0;
  for (const p of lm) cx += p.x;
  cx /= lm.length;

  set(`pose.${performerTag}.motion`, motion);
  set(`pose.${performerTag}.openness`, openness);
  set(`pose.${performerTag}.cx`, cx);

  // Aggregate signals (average of performers that have reported)
  set('pose.motion', motion);
  set('pose.openness', openness);
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
  video = null;
  prevLandmarks = null;
}
