import { set } from './bus';
import { config } from './settings';

export const POSE_STATES = [
  'neutral', 'compact', 'expansive', 'leftReach', 'rightReach', 'elevated',
] as const;

export type PoseState = (typeof POSE_STATES)[number];

const TRANSITION_MS = 600;
const DEBOUNCE_FRAMES = 4;

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

/**
 * Per-performer pose state machine. Holds its own debounce / transition
 * state so two performers can run independently without interfering.
 */
export class PoseStateTracker {
  private tag: string;
  private current: PoseState = 'neutral';
  private target: PoseState = 'neutral';
  private transitionStart = 0;
  private candidate: PoseState = 'neutral';
  private candidateCount = 0;

  constructor(tag: string) {
    this.tag = tag;
  }

  /**
   * Run one frame of pose-state classification and write per-performer
   * bus keys: `pose.state.${tag}.${stateName}`.
   * Returns a record of {stateName: value} for aggregate computation.
   */
  update(landmarks: { x: number; y: number }[]): Record<string, number> | null {
    const nose = landmarks[0];
    const lWrist = landmarks[15];
    const rWrist = landmarks[16];
    if (!nose || !lWrist || !rWrist) return null;

    const handDist = Math.hypot(lWrist.x - rWrist.x, lWrist.y - rWrist.y);
    const noseToLeft = Math.hypot(nose.x - lWrist.x, nose.y - lWrist.y);
    const noseToRight = Math.hypot(nose.x - rWrist.x, nose.y - rWrist.y);

    if (config.poseTriangle) {
      set(`pose.${this.tag}.handDist`, Math.min(1, handDist * 1.5), 0.6);
      set(`pose.${this.tag}.noseToLeft`, Math.min(1, noseToLeft * 1.5), 0.6);
      set(`pose.${this.tag}.noseToRight`, Math.min(1, noseToRight * 1.5), 0.6);
    }

    if (!config.poseStates) return null;

    const next = classify(handDist, noseToLeft, noseToRight, lWrist.y, rWrist.y, nose.y);

    if (next === this.candidate) {
      this.candidateCount++;
    } else {
      this.candidate = next;
      this.candidateCount = 1;
    }

    if (this.candidate !== this.target && this.candidateCount >= DEBOUNCE_FRAMES) {
      this.current = this.target;
      this.target = this.candidate;
      this.transitionStart = performance.now();
    }

    const elapsed = performance.now() - this.transitionStart;
    const progress = Math.min(1, elapsed / TRANSITION_MS);
    const eased = easeInOutQuad(progress);

    const values: Record<string, number> = {};
    for (const state of POSE_STATES) {
      const from = state === this.current ? 1 : 0;
      const to = state === this.target ? 1 : 0;
      const v = from + (to - from) * eased;
      set(`pose.state.${this.tag}.${state}`, v, 0);
      values[state] = v;
    }
    return values;
  }
}

// ---- Legacy module-level function for backwards compatibility ----
// Kept so that any external callers don't break, but internally
// mediapipe.ts now uses PoseStateTracker instances directly.

let _defaultTracker: PoseStateTracker | null = null;

export function updatePoseState(landmarks: { x: number; y: number }[]) {
  if (!_defaultTracker) _defaultTracker = new PoseStateTracker('p1');
  const values = _defaultTracker.update(landmarks);
  // Also write the un-tagged aggregate keys for scene compat
  if (values) {
    for (const state of POSE_STATES) {
      set(`pose.state.${state}`, values[state], 0);
    }
  }
}
