import { set } from './bus';
import { config } from './settings';

export const POSE_STATES = [
  'neutral', 'compact', 'expansive', 'leftReach', 'rightReach', 'elevated',
] as const;

export type PoseState = (typeof POSE_STATES)[number];

const TRANSITION_MS = 600;
const DEBOUNCE_FRAMES = 4;

let current: PoseState = 'neutral';
let target: PoseState = 'neutral';
let transitionStart = 0;

let candidate: PoseState = 'neutral';
let candidateCount = 0;

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function classify(
  handDist: number,
  noseToLeft: number,
  noseToRight: number,
  leftY: number,
  rightY: number,
  noseY: number,
): PoseState {
  if (leftY < noseY - 0.08 && rightY < noseY - 0.08) return 'elevated';
  if (handDist < 0.15 && noseToLeft < 0.25 && noseToRight < 0.25) return 'compact';
  if (handDist > 0.4) return 'expansive';
  const asym = noseToLeft - noseToRight;
  if (asym > 0.15) return 'leftReach';
  if (asym < -0.15) return 'rightReach';
  return 'neutral';
}

export function updatePoseState(landmarks: { x: number; y: number }[]) {
  const nose = landmarks[0];
  const lWrist = landmarks[15];
  const rWrist = landmarks[16];
  if (!nose || !lWrist || !rWrist) return;

  const handDist = Math.hypot(lWrist.x - rWrist.x, lWrist.y - rWrist.y);
  const noseToLeft = Math.hypot(nose.x - lWrist.x, nose.y - lWrist.y);
  const noseToRight = Math.hypot(nose.x - rWrist.x, nose.y - rWrist.y);

  if (config.poseTriangle) {
    set('pose.handDist', Math.min(1, handDist * 1.5), 0.6);
    set('pose.noseToLeft', Math.min(1, noseToLeft * 1.5), 0.6);
    set('pose.noseToRight', Math.min(1, noseToRight * 1.5), 0.6);
  }

  if (!config.poseStates) return;

  const next = classify(handDist, noseToLeft, noseToRight, lWrist.y, rWrist.y, nose.y);

  if (next === candidate) {
    candidateCount++;
  } else {
    candidate = next;
    candidateCount = 1;
  }

  if (candidate !== target && candidateCount >= DEBOUNCE_FRAMES) {
    current = target;
    target = candidate;
    transitionStart = performance.now();
  }

  const elapsed = performance.now() - transitionStart;
  const progress = Math.min(1, elapsed / TRANSITION_MS);
  const eased = easeInOutQuad(progress);

  for (const state of POSE_STATES) {
    const from = state === current ? 1 : 0;
    const to = state === target ? 1 : 0;
    set(`pose.state.${state}`, from + (to - from) * eased, 0);
  }
}
