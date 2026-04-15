import type p5 from 'p5';
import { get, pulse } from '../../bus';
import { getKeypoints, getActiveTags } from '../../mediapipe';
import type { P5Scene } from './types';

// Abstract flowing curves driven by live pose keypoints. Each performer
// contributes their own geometry — two Catmull-Rom splines (left chain
// and right chain) through head → shoulder → elbow → wrist, drawn as
// stacked offset strokes to build up organic ribbons. Pose/face state
// drive colour; MIDI CCs drive trail/turbulence/stroke weight.

// MediaPipe upper-body landmark indices
const NOSE = 0;
const L_SHOULDER = 11, R_SHOULDER = 12;
const L_ELBOW = 13, R_ELBOW = 14;
const L_WRIST = 15, R_WRIST = 16;

// Sampling density along each spline
const SAMPLES_PER_SEGMENT = 24;
// How many parallel offset strokes build each limb ribbon
const STROKE_LAYERS = 5;
// Default fallback when a performer briefly loses pose
const FALLBACK_TIMEOUT_MS = 500;

type Pt = { x: number; y: number };

// Catmull-Rom interpolation between p1 and p2 using p0, p3 as tangent guides.
function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

// Per-performer transient state (timestamp of last valid pose etc.)
type PerformerState = { lastSeen: number };

export class BodyLinesScene implements P5Scene {
  readonly name = 'bodyLines';
  private time = 0;
  private state = new Map<string, PerformerState>();

  setup(p: p5): void {
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.strokeCap(p.ROUND);
    p.strokeJoin(p.ROUND);
    p.noFill();
  }

  draw(p: p5, dt: number): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;

    // ---- Global (non-performer-specific) signals ----
    const rms = get('audio.rms');
    const centroid = get('audio.centroid', 0.3);
    const onset = pulse('audio.onset');

    // MIDI CCs
    const cc17 = get('midi.cc.17');  // hue shift
    const cc19 = get('midi.cc.19');  // flow speed
    const cc20 = get('midi.cc.20');  // squiggle/turbulence
    const cc21 = get('midi.cc.21');  // trail amount (0=no trail, 1=heavy smear)
    const cc23 = get('midi.cc.23');  // stroke weight
    const cc25 = get('midi.cc.25');  // brightness
    const cc26 = get('midi.cc.26');  // layer offset / ribbon spread

    // ---- Trail via alpha background ----
    // cc21: 0 → full clear (bgAlpha 100), 1 → heavy trail (bgAlpha ~6)
    const bgAlpha = 100 - cc21 * 94;
    p.background(0, 0, 0, bgAlpha);

    // ---- Iterate performers ----
    const tags = getActiveTags();
    if (tags.length === 0) {
      // No trackers yet — still tick to keep trail refreshing.
      return;
    }

    const now = performance.now();

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const lm = getKeypoints(tag);
      const st = this.state.get(tag) ?? { lastSeen: 0 };
      this.state.set(tag, st);

      if (lm) st.lastSeen = now;
      if (!lm || now - st.lastSeen > FALLBACK_TIMEOUT_MS) continue;

      // ---- Per-performer signals ----
      // Each performer has their own pose state + face; fall back to
      // aggregate when per-performer isn't available.
      const compact   = get(`pose.state.${tag}.compact`,   get('pose.state.compact'));
      const expansive = get(`pose.state.${tag}.expansive`, get('pose.state.expansive'));
      const elevated  = get(`pose.state.${tag}.elevated`,  get('pose.state.elevated'));
      const motion    = get(`pose.${tag}.motion`, get('pose.motion'));
      const openness  = get(`pose.${tag}.openness`, get('pose.openness'));
      const mouthOpen = get(`face.${tag}.mouthOpen`, get('face.mouthOpen'));
      const browUp    = get(`face.${tag}.browUp`,    get('face.browUp'));
      const browDown  = get(`face.${tag}.browDown`,  get('face.browDown'));
      const eyeSquint = get(`face.${tag}.eyeSquint`, get('face.eyeSquint'));

      // ---- Convert landmarks to canvas coords ----
      const W = p.width, H = p.height;
      const pt = (idx: number): Pt | null => {
        const l = lm[idx];
        // MediaPipe x is mirrored; flip so performer's right hand appears on their right.
        return l ? { x: (1 - l.x) * W, y: l.y * H } : null;
      };

      const nose = pt(NOSE);
      const lsh = pt(L_SHOULDER), rsh = pt(R_SHOULDER);
      const lel = pt(L_ELBOW),    rel = pt(R_ELBOW);
      const lwr = pt(L_WRIST),    rwr = pt(R_WRIST);
      if (!nose || !lsh || !rsh) continue;

      // ---- Colour ----
      // Each performer gets a distinct base hue, then audio/state shift it.
      // p1: cool (cyan/blue range), p2: warm (magenta/orange range).
      const performerHue = i === 0 ? 180 : 340;
      const hue = (
        performerHue
        + centroid * 60
        + cc17 * 120
        + elevated * 40
        - compact * 30
        + browUp * 50
        - browDown * 40
        + this.time * 8
      ) % 360;

      const sat = 40 + eyeSquint * 40 + expansive * 20 + rms * 15;
      const bright = 50 + cc25 * 40 + elevated * 20 + rms * 25 + onset * 20;

      // ---- Geometry parameters ----
      // Squiggle amplitude from motion + audio + turbulence CC.
      // Compact pulls it in; expansive pushes it out.
      const bodyScale = Math.hypot(lsh.x - rsh.x, lsh.y - rsh.y) || 100;
      const squiggleAmp = bodyScale * (0.04 + motion * 0.35 + rms * 0.25 + cc20 * 0.6 - compact * 0.03 + expansive * 0.08);

      // Flow speed scales time-axis of squiggle noise.
      const flow = 0.8 + cc19 * 4 + motion * 2 + onset * 3;

      // Stroke weight scales with body size + audio + MIDI.
      const baseWeight = bodyScale * (0.015 + cc23 * 0.06 + rms * 0.04 + onset * 0.05);

      // Ribbon spread: perpendicular offset between stacked strokes.
      const spread = bodyScale * (0.01 + cc26 * 0.05 + openness * 0.03 + mouthOpen * 0.04);

      // ---- Build the two chains: left and right arm ----
      // Extend the chain with duplicated end points so Catmull-Rom has
      // tangent guides at both endpoints.
      const leftChain = this.buildChain(nose, lsh, lel, lwr);
      const rightChain = this.buildChain(nose, rsh, rel, rwr);

      // Seed the squiggle phase per-performer so p1 and p2 don't sync up.
      const seed = i * 13.37;

      // Draw ribbons: left chain (cooler tint variant), right chain (warmer).
      this.drawRibbon(p, leftChain, squiggleAmp, flow, seed + 1.1,
        hue, sat, bright, baseWeight, spread);
      this.drawRibbon(p, rightChain, squiggleAmp, flow, seed + 7.7,
        (hue + 30) % 360, sat, bright, baseWeight, spread);

      // Optional: connecting arc between the two wrists when available,
      // sketching the "arm span" as an ephemeral line.
      if (lwr && rwr) {
        const mid: Pt = {
          x: (lwr.x + rwr.x) * 0.5,
          y: (lwr.y + rwr.y) * 0.5 - bodyScale * (0.2 + expansive * 0.3),
        };
        const arc: Pt[] = [lwr, lwr, mid, rwr, rwr];
        this.drawRibbon(p, arc, squiggleAmp * 0.7, flow * 0.8, seed + 3.3,
          (hue + 180) % 360, sat * 0.8, bright * 0.9, baseWeight * 0.5, spread * 0.6);
      }

      // Onset flash: brief ring at the sternum (midpoint of shoulders).
      if (onset > 0.05) {
        const cx = (lsh.x + rsh.x) * 0.5;
        const cy = (lsh.y + rsh.y) * 0.5;
        const r = bodyScale * (0.4 + onset * 1.5);
        p.strokeWeight(onset * baseWeight * 2);
        p.stroke(hue, 20, 100, onset * 80);
        p.ellipse(cx, cy, r * 2, r * 2);
      }
    }
  }

  resize(_p: p5, _w: number, _h: number): void {
    // Layout follows p.width/p.height each frame — nothing to do.
  }

  dispose(): void {
    this.time = 0;
    this.state.clear();
  }

  // ---- Helpers ----

  /** Build a chain of 6 points (duplicated endpoints) for Catmull-Rom. */
  private buildChain(head: Pt, shoulder: Pt, elbow: Pt | null, wrist: Pt | null): Pt[] {
    const chain: Pt[] = [head, shoulder];
    if (elbow) chain.push(elbow);
    if (wrist) chain.push(wrist);
    // Duplicate endpoints so tangents at first/last segments don't diverge.
    return [chain[0], ...chain, chain[chain.length - 1]];
  }

  /** Draw a Catmull-Rom ribbon with multiple offset strokes. */
  private drawRibbon(
    p: p5, chain: Pt[],
    squiggleAmp: number, flow: number, seed: number,
    hue: number, sat: number, bright: number,
    baseWeight: number, spread: number,
  ): void {
    if (chain.length < 4) return;

    // Sample the full spline into a polyline with squiggle offsets.
    const poly: { x: number; y: number; nx: number; ny: number }[] = [];
    for (let i = 1; i < chain.length - 2; i++) {
      const p0 = chain[i - 1], p1 = chain[i], p2 = chain[i + 1], p3 = chain[i + 2];
      for (let s = 0; s < SAMPLES_PER_SEGMENT; s++) {
        const t = s / SAMPLES_PER_SEGMENT;
        const pt = catmull(p0, p1, p2, p3, t);
        // Finite-difference tangent for perpendicular.
        const ptNext = catmull(p0, p1, p2, p3, Math.min(1, t + 0.02));
        const dx = ptNext.x - pt.x, dy = ptNext.y - pt.y;
        const len = Math.hypot(dx, dy) || 1;
        // Perpendicular unit vector.
        const nx = -dy / len, ny = dx / len;

        // Squiggle offset via layered sinusoids (cheap, deterministic).
        const u = (i - 1 + t) / (chain.length - 3);
        const osc =
          Math.sin(u * 9 + this.time * flow + seed) *
          Math.cos(u * 6.3 + this.time * flow * 0.7 + seed * 2.1);
        const taper = Math.sin(u * Math.PI); // 0 at ends, 1 at middle
        const offset = osc * squiggleAmp * taper;

        poly.push({
          x: pt.x + nx * offset,
          y: pt.y + ny * offset,
          nx, ny,
        });
      }
    }
    if (poly.length < 2) return;

    // Draw stacked offset strokes.
    for (let layer = 0; layer < STROKE_LAYERS; layer++) {
      // Layer offset ranges from -(STROKE_LAYERS-1)/2 to +(STROKE_LAYERS-1)/2.
      const layerT = (layer / (STROKE_LAYERS - 1)) * 2 - 1;
      const layerOffset = layerT * spread * (STROKE_LAYERS - 1) * 0.5;

      // Alpha + hue shift per layer: centre layer brightest, outer ghosted.
      const layerAlpha = 90 - Math.abs(layerT) * 60;
      const layerHue = (hue + layerT * 12 + 360) % 360;
      // Weight: centre layer heaviest.
      const layerWeight = baseWeight * (1 - Math.abs(layerT) * 0.5);

      p.stroke(layerHue, sat, bright, layerAlpha);
      p.strokeWeight(Math.max(0.3, layerWeight));
      p.beginShape();
      for (const v of poly) {
        p.vertex(v.x + v.nx * layerOffset, v.y + v.ny * layerOffset);
      }
      p.endShape();
    }
  }
}
