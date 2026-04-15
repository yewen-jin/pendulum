import type p5 from 'p5';
import { get, pulse } from '../../bus';
import { getKeypointsSmoothed, getActiveTags } from '../../mediapipe';
import { config } from '../../settings';
import type { P5Scene } from './types';

// Abstract body geometry with four co-existing visual treatments that
// crossfade based on pose state:
//
//   ribbons    — Catmull-Rom curves along arm chains (base, always on)
//   silhouette — closed body polygon filled with performer colour
//                (positive space). Driven by pose.state.*.compact
//   inverse    — full screen filled, body punched out as a hole
//                (negative space). Driven by pose.state.*.elevated
//   glow       — polygon fill + shadowBlur halo.
//                Driven by pose.state.*.expansive
//
// Pose states crossfade over 600 ms so transitions are automatic —
// a performer shifting from compact to elevated smoothly dissolves
// the silhouette fill into an inverse cut-out. Other signals
// (audio, face, MIDI) modulate colour + motion within each state.

// MediaPipe upper-body landmark indices
const NOSE = 0;
const L_SHOULDER = 11, R_SHOULDER = 12;
const L_ELBOW = 13, R_ELBOW = 14;
const L_WRIST = 15, R_WRIST = 16;

// Sampling density for ribbon splines
const SAMPLES_PER_SEGMENT = 24;
// Sampling density for the smoothed body polygon (per edge)
const POLY_SAMPLES_PER_SEGMENT = 10;
// Number of parallel offset strokes per ribbon
const STROKE_LAYERS = 5;
// Minimum fraction of ribbon alpha that persists under silhouette/inverse/glow
const RIBBON_FLOOR = 0.3;

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
  }

  draw(p: p5, dt: number): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;

    // ---- Global signals ----
    const rms = get('audio.rms');
    const centroid = get('audio.centroid', 0.3);
    const onset = pulse('audio.onset');

    // MIDI CCs
    const cc17 = get('midi.cc.17');  // hue shift
    const cc19 = get('midi.cc.19');  // flow speed
    const cc20 = get('midi.cc.20');  // squiggle/turbulence
    const cc21 = get('midi.cc.21');  // trail amount
    const cc23 = get('midi.cc.23');  // stroke weight
    const cc25 = get('midi.cc.25');  // brightness
    const cc26 = get('midi.cc.26');  // ribbon spread

    // ---- Background trail ----
    const bgAlpha = 100 - cc21 * 94;
    p.background(0, 0, 0, bgAlpha);

    const tags = getActiveTags();
    if (tags.length === 0) return;

    const now = performance.now();
    const W = p.width, H = p.height;

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const lm = getKeypointsSmoothed(tag);
      const st = this.state.get(tag) ?? { lastSeen: 0 };
      this.state.set(tag, st);

      if (lm) st.lastSeen = now;
      if (!lm || now - st.lastSeen > config.bodyLinesDropoutMs) continue;

      // ---- Per-performer signals ----
      const compact   = get(`pose.state.${tag}.compact`,   get('pose.state.compact'));
      const expansive = get(`pose.state.${tag}.expansive`, get('pose.state.expansive'));
      const elevated  = get(`pose.state.${tag}.elevated`,  get('pose.state.elevated'));
      const motion    = get(`pose.${tag}.motion`, get('pose.motion'));
      const openness  = get(`pose.${tag}.openness`, get('pose.openness'));
      const mouthOpen = get(`face.${tag}.mouthOpen`, get('face.mouthOpen'));
      const browUp    = get(`face.${tag}.browUp`,    get('face.browUp'));
      const browDown  = get(`face.${tag}.browDown`,  get('face.browDown'));
      const eyeSquint = get(`face.${tag}.eyeSquint`, get('face.eyeSquint'));

      // ---- Resolve keypoints in canvas space ----
      const pt = (idx: number): Pt | null => {
        const l = lm[idx];
        return l ? { x: (1 - l.x) * W, y: l.y * H } : null;
      };
      const nose = pt(NOSE);
      const lsh = pt(L_SHOULDER), rsh = pt(R_SHOULDER);
      const lel = pt(L_ELBOW),    rel = pt(R_ELBOW);
      const lwr = pt(L_WRIST),    rwr = pt(R_WRIST);
      if (!nose || !lsh || !rsh) continue;

      // ---- Derived geometry ----
      const bodyScale = Math.hypot(lsh.x - rsh.x, lsh.y - rsh.y) || 100;

      // ---- Colour ----
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
        + 360
      ) % 360;
      const sat = 40 + eyeSquint * 40 + expansive * 20 + rms * 15;
      const bright = 50 + cc25 * 40 + elevated * 20 + rms * 25 + onset * 20;

      // ---- Ribbon geometry parameters ----
      const squiggleAmp = bodyScale * (0.04 + motion * 0.35 + rms * 0.25 + cc20 * 0.6 - compact * 0.03 + expansive * 0.08);
      const flow = 0.8 + cc19 * 4 + motion * 2 + onset * 3;
      const baseWeight = bodyScale * (0.015 + cc23 * 0.06 + rms * 0.04 + onset * 0.05);
      const spread = bodyScale * (0.01 + cc26 * 0.05 + openness * 0.03 + mouthOpen * 0.04);

      // ---- State weights ----
      // Each layer stacks at its own weight. Ribbons never fully fade so the
      // body's limb structure stays readable under silhouette/inverse/glow.
      const wSil = compact;
      const wInv = elevated;
      const wGlow = expansive;
      const wRib = Math.max(RIBBON_FLOOR, 1 - 0.7 * Math.max(wSil, wInv, wGlow));

      // ---- Body polygon ----
      // Build a sparse closed polygon through the pose, then Catmull-Rom
      // smooth it into a dense curve. Both silhouette and inverse use the
      // smoothed polygon; glow uses it too with shadowBlur for the halo.
      const polygon = this.buildBodyPolygon(nose, lsh, rsh, lel, rel, lwr, rwr, bodyScale);
      const smoothPoly = polygon.length >= 3 ? smoothClosed(polygon) : null;

      // ---- Draw state layers (bottom to top) ----
      if (smoothPoly) {
        if (wSil > 0.01) this.drawSilhouette(p, smoothPoly, wSil, hue, sat, bright, bodyScale);
        if (wGlow > 0.01) this.drawGlow(p, smoothPoly, wGlow, hue, sat, bright, bodyScale);
        if (wInv > 0.01) this.drawInverse(p, smoothPoly, wInv, hue, sat, bright, W, H);
      }

      // ---- Ribbons on top (always present, weighted alpha) ----
      const seed = i * 13.37;
      const leftChain = this.buildChain(nose, lsh, lel, lwr);
      const rightChain = this.buildChain(nose, rsh, rel, rwr);
      this.drawRibbon(p, leftChain, squiggleAmp, flow, seed + 1.1,
        hue, sat, bright, baseWeight, spread, wRib);
      this.drawRibbon(p, rightChain, squiggleAmp, flow, seed + 7.7,
        (hue + 30) % 360, sat, bright, baseWeight, spread, wRib);

      if (lwr && rwr) {
        const mid: Pt = {
          x: (lwr.x + rwr.x) * 0.5,
          y: (lwr.y + rwr.y) * 0.5 - bodyScale * (0.2 + expansive * 0.3),
        };
        const arc: Pt[] = [lwr, lwr, mid, rwr, rwr];
        this.drawRibbon(p, arc, squiggleAmp * 0.7, flow * 0.8, seed + 3.3,
          (hue + 180) % 360, sat * 0.8, bright * 0.9, baseWeight * 0.5, spread * 0.6, wRib);
      }

      // Onset flash (ribbon-state accent, follows ribbon weight so it fades
      // in silhouette/inverse where the flash would be invisible anyway).
      if (onset > 0.05 && wRib > 0.2) {
        const cx = (lsh.x + rsh.x) * 0.5;
        const cy = (lsh.y + rsh.y) * 0.5;
        const r = bodyScale * (0.4 + onset * 1.5);
        p.noFill();
        p.strokeWeight(onset * baseWeight * 2);
        p.stroke(hue, 20, 100, onset * 80 * wRib);
        p.ellipse(cx, cy, r * 2, r * 2);
      }
    }
  }

  resize(_p: p5, _w: number, _h: number): void {}

  dispose(): void {
    this.time = 0;
    this.state.clear();
  }

  // ---- Polygon construction ----

  /** Build a sparse closed body polygon in canvas space.
   *  Missing keypoints fall back to the nearest available joint. */
  private buildBodyPolygon(
    nose: Pt, lsh: Pt, rsh: Pt,
    lel: Pt | null, rel: Pt | null,
    lwr: Pt | null, rwr: Pt | null,
    bodyScale: number,
  ): Pt[] {
    // Estimate hip positions below each shoulder.
    const hipDrop = bodyScale * 0.95;
    const lhip: Pt = { x: lsh.x, y: lsh.y + hipDrop };
    const rhip: Pt = { x: rsh.x, y: rsh.y + hipDrop };

    // Traverse counter-clockwise (for canvas Y-down this means: up the
    // left arm, over the head, down the right arm, across the waist).
    const path: Pt[] = [];
    if (lwr) path.push(lwr);
    if (lel) path.push(lel);
    path.push(lsh);
    path.push(nose);
    path.push(rsh);
    if (rel) path.push(rel);
    if (rwr) path.push(rwr);
    path.push(rhip);
    path.push(lhip);
    return path;
  }

  // ---- State renderers ----

  /** Positive space: filled body polygon in performer hue. */
  private drawSilhouette(
    p: p5, poly: Pt[], weight: number,
    hue: number, sat: number, bright: number, bodyScale: number,
  ): void {
    const alpha = 70 * weight;
    p.noStroke();
    // Soft outer halo using shadowBlur so the fill doesn't have hard edges.
    const ctx = (p as any).drawingContext as CanvasRenderingContext2D;
    ctx.shadowBlur = bodyScale * 0.2;
    ctx.shadowColor = `hsla(${hue}, ${Math.min(100, sat)}%, ${Math.min(100, bright * 0.6)}%, ${weight * 0.5})`;
    p.fill(hue, Math.min(100, sat + 15), Math.min(100, bright + 10), alpha);
    p.beginShape();
    for (const pt of poly) p.vertex(pt.x, pt.y);
    p.endShape(p.CLOSE);
    ctx.shadowBlur = 0;
  }

  /** Negative space: full-screen rectangle filled with the complement of the
   *  performer hue, with the body polygon punched out as a hole via
   *  beginContour. The trail background shows through the hole. */
  private drawInverse(
    p: p5, poly: Pt[], weight: number,
    hue: number, sat: number, bright: number,
    W: number, H: number,
  ): void {
    const compHue = (hue + 180) % 360;
    const alpha = 75 * weight;
    p.noStroke();
    p.fill(compHue, Math.min(100, sat * 0.9), bright * 0.75, alpha);
    p.beginShape();
    // Outer boundary clockwise
    p.vertex(0, 0);
    p.vertex(W, 0);
    p.vertex(W, H);
    p.vertex(0, H);
    // Inner contour (hole) — reverse winding
    p.beginContour();
    for (let i = poly.length - 1; i >= 0; i--) {
      p.vertex(poly[i].x, poly[i].y);
    }
    p.endContour();
    p.endShape(p.CLOSE);
  }

  /** Radiant: soft filled polygon with heavy shadowBlur halo. */
  private drawGlow(
    p: p5, poly: Pt[], weight: number,
    hue: number, sat: number, bright: number, bodyScale: number,
  ): void {
    const ctx = (p as any).drawingContext as CanvasRenderingContext2D;
    ctx.shadowBlur = bodyScale * (0.4 + weight * 0.6);
    ctx.shadowColor = `hsla(${hue}, ${Math.min(100, sat)}%, ${Math.min(100, bright)}%, ${weight})`;
    p.noStroke();
    p.fill(hue, Math.max(0, sat - 20), Math.min(100, bright + 20), 40 * weight);
    p.beginShape();
    for (const pt of poly) p.vertex(pt.x, pt.y);
    p.endShape(p.CLOSE);
    ctx.shadowBlur = 0;
  }

  // ---- Chain + ribbon helpers ----

  /** Build a chain of points (with duplicated endpoints) for Catmull-Rom. */
  private buildChain(head: Pt, shoulder: Pt, elbow: Pt | null, wrist: Pt | null): Pt[] {
    const chain: Pt[] = [head, shoulder];
    if (elbow) chain.push(elbow);
    if (wrist) chain.push(wrist);
    return [chain[0], ...chain, chain[chain.length - 1]];
  }

  /** Catmull-Rom ribbon with stacked offset strokes. */
  private drawRibbon(
    p: p5, chain: Pt[],
    squiggleAmp: number, flow: number, seed: number,
    hue: number, sat: number, bright: number,
    baseWeight: number, spread: number,
    alphaMult: number,
  ): void {
    if (chain.length < 4) return;

    const poly: { x: number; y: number; nx: number; ny: number }[] = [];
    for (let i = 1; i < chain.length - 2; i++) {
      const p0 = chain[i - 1], p1 = chain[i], p2 = chain[i + 1], p3 = chain[i + 2];
      for (let s = 0; s < SAMPLES_PER_SEGMENT; s++) {
        const t = s / SAMPLES_PER_SEGMENT;
        const pt = catmull(p0, p1, p2, p3, t);
        const ptNext = catmull(p0, p1, p2, p3, Math.min(1, t + 0.02));
        const dx = ptNext.x - pt.x, dy = ptNext.y - pt.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;

        const u = (i - 1 + t) / (chain.length - 3);
        const osc =
          Math.sin(u * 9 + this.time * flow + seed) *
          Math.cos(u * 6.3 + this.time * flow * 0.7 + seed * 2.1);
        const taper = Math.sin(u * Math.PI);
        const offset = osc * squiggleAmp * taper;

        poly.push({ x: pt.x + nx * offset, y: pt.y + ny * offset, nx, ny });
      }
    }
    if (poly.length < 2) return;

    p.noFill();
    for (let layer = 0; layer < STROKE_LAYERS; layer++) {
      const layerT = (layer / (STROKE_LAYERS - 1)) * 2 - 1;
      const layerOffset = layerT * spread * (STROKE_LAYERS - 1) * 0.5;
      const layerAlpha = (90 - Math.abs(layerT) * 60) * alphaMult;
      const layerHue = (hue + layerT * 12 + 360) % 360;
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

// ---- Free helpers ----

/** Smooth a closed polygon with Catmull-Rom, wrapping indices. */
function smoothClosed(pts: Pt[]): Pt[] {
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < POLY_SAMPLES_PER_SEGMENT; s++) {
      out.push(catmull(p0, p1, p2, p3, s / POLY_SAMPLES_PER_SEGMENT));
    }
  }
  return out;
}
