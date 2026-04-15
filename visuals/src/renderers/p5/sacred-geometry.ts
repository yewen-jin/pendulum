import type p5 from 'p5';
import { get, pulse } from '../../bus';
import { getKeypoints, getActiveTags } from '../../mediapipe';
import type { P5Scene } from './types';

// Radial mandala built from N-fold symmetry. Composition of Islamic
// geometry archetypes: flower-of-life base, concentric rings, radial
// spokes, polygon + {N/k} star overlays, petal arcs, inner star.
//
// The pattern is anchored between the performers — centre follows the
// aggregate shoulder midpoint, scale follows body size — so the
// mandala visibly belongs to the room rather than floating abstractly.
// Symmetry and rotation are audio-reactive but the geometry stays
// crystalline (no squiggle noise) to preserve the contemplative feel.

const NOSE = 0;
const L_SHOULDER = 11, R_SHOULDER = 12;

// Symmetry count is clamped to this range — low end keeps it legible,
// high end starts to look like a smooth ring.
const N_MIN = 6;
const N_MAX = 16;

type Pt = { x: number; y: number };

export class SacredGeometryScene implements P5Scene {
  readonly name = 'sacredGeometry';
  private time = 0;
  // Smoothed centre + radius so the mandala glides rather than snaps.
  private cx = 0;
  private cy = 0;
  private radius = 300;

  setup(p: p5): void {
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noFill();
    p.strokeCap(p.ROUND);
    p.strokeJoin(p.ROUND);
    this.cx = p.width * 0.5;
    this.cy = p.height * 0.5;
  }

  draw(p: p5, dt: number): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;

    // ---- Global signals ----
    const rms = get('audio.rms');
    const centroid = get('audio.centroid', 0.3);
    const onset = pulse('audio.onset');

    // Pose (aggregate — the mandala is a shared space, not per-performer)
    const motion = get('pose.motion');
    const openness = get('pose.openness');
    const compact = get('pose.state.compact');
    const expansive = get('pose.state.expansive');
    const elevated = get('pose.state.elevated');
    const leftReach = get('pose.state.leftReach');
    const rightReach = get('pose.state.rightReach');

    // MIDI
    const cc16 = get('midi.cc.16');  // concentric ring count
    const cc17 = get('midi.cc.17');  // hue shift
    const cc18 = get('midi.cc.18');  // symmetry count (kaleid knob — fitting)
    const cc19 = get('midi.cc.19');  // rotation speed
    const cc20 = get('midi.cc.20');  // star skip (k in {N/k})
    const cc21 = get('midi.cc.21');  // trail
    const cc22 = get('midi.cc.22');  // extra rotation spin
    const cc23 = get('midi.cc.23');  // scale multiplier
    const cc25 = get('midi.cc.25');  // brightness

    // ---- Trail ----
    const bgAlpha = 100 - cc21 * 94;
    p.background(0, 0, 0, bgAlpha);

    // ---- Anchor the mandala ----
    // Centre follows the midpoint of all active performers' sterns;
    // radius follows the mean shoulder width. Lerp so movement is smooth.
    const target = this.computeAnchor(p);
    this.cx += (target.x - this.cx) * 0.08;
    this.cy += (target.y - this.cy) * 0.08;
    // RMS breathes the radius; cc23 is a static zoom; elevated lifts the
    // centre upward slightly. cc23 mapped to [-0.4, +0.6] so the knob at
    // zero leaves scale alone.
    const scaleMul = 1 + (cc23 - 0.4) * 1.0 + rms * 0.2 + openness * 0.15;
    const targetR = target.r * Math.max(0.3, scaleMul);
    this.radius += (targetR - this.radius) * 0.08;
    const R = this.radius;
    const cy = this.cy - elevated * R * 0.15;

    // ---- Symmetry ----
    const nFloat = N_MIN + cc18 * (N_MAX - N_MIN) + expansive * 2 - compact * 1;
    const N = Math.max(3, Math.round(nFloat));

    // ---- Rotation ----
    // Base spin from time + cc19 flow + onset kick; reach bias makes the
    // mandala torque when a performer extends asymmetrically.
    const flow = 0.05 + cc19 * 0.8 + motion * 0.5 + onset * 1.5;
    const reachBias = (leftReach - rightReach) * 0.4;
    const rotation = this.time * flow + reachBias + cc22 * Math.PI * 2;

    // ---- Colour ----
    const baseHue = (centroid * 140 + cc17 * 360 + this.time * 6) % 360;
    const sat = 35 + rms * 25 + expansive * 15;
    const bright = 45 + cc25 * 45 + rms * 20 + elevated * 20 + onset * 25;

    // ---- Draw ----
    p.push();
    p.translate(this.cx, cy);
    p.rotate(rotation);

    // 1. Flower-of-life base — 7 overlapping circles, subtle.
    this.drawFlowerOfLife(p, R * 0.35, baseHue, sat * 0.6, bright * 0.7);

    // 2. Concentric rings breathing with RMS.
    const rings = Math.round(3 + cc16 * 7 + rms * 2);
    this.drawConcentricRings(p, R, rings, baseHue, sat, bright, rms);

    // 3. Radial spokes — one line from centre to each vertex.
    this.drawSpokes(p, R, N, (baseHue + 20) % 360, sat, bright);

    // 4. Outer N-gon.
    this.drawPolygon(p, R, N, 0, (baseHue + 40) % 360, sat, bright, 2.0);

    // 5. {N / k} star polygon (connect every k-th vertex). cc20 picks k.
    // k must stay < N/2 for a proper star; clamp.
    const kFloat = 2 + cc20 * (N * 0.5 - 2);
    const k = Math.max(2, Math.min(Math.floor(N / 2 - 1), Math.round(kFloat)));
    if (N >= 5 && k >= 2) {
      this.drawStarPolygon(p, R * 0.92, N, k, (baseHue + 80) % 360, sat, bright, 1.5);
    }

    // 6. Petal arcs between adjacent spokes — curve inward, depth from
    // openness + expansive.
    const petalDepth = 0.25 + openness * 0.35 + expansive * 0.25;
    this.drawPetalArcs(p, R * 0.75, N, petalDepth, (baseHue + 120) % 360, sat, bright);

    // 7. Inner pointed star (2N vertices alternating r_out/r_in).
    const innerR = R * (0.25 + elevated * 0.15);
    this.drawPointedStar(p, innerR, innerR * 0.45, N, (baseHue + 200) % 360, sat + 15, bright + 10);

    // 8. Centre dot.
    p.noStroke();
    p.fill(baseHue, sat + 30, Math.min(100, bright + 20), 60 + onset * 40);
    p.ellipse(0, 0, R * 0.04, R * 0.04);
    p.noFill();

    p.pop();

    // 9. Onset burst — concentric ring expanding from centre, NOT rotated
    // with the mandala so the hit feels like a bell strike.
    if (onset > 0.05) {
      const burstR = R * (0.5 + onset * 1.4);
      p.strokeWeight(onset * 4);
      p.stroke((baseHue + 60) % 360, 30, 100, onset * 80);
      p.ellipse(this.cx, cy, burstR * 2, burstR * 2);
    }
  }

  resize(p: p5, _w: number, _h: number): void {
    // Recentre if the canvas was resized while we were at default centre.
    this.cx = p.width * 0.5;
    this.cy = p.height * 0.5;
  }

  dispose(): void {
    this.time = 0;
  }

  // ---- Anchor resolution ----

  private computeAnchor(p: p5): { x: number; y: number; r: number } {
    const tags = getActiveTags();
    const W = p.width, H = p.height;

    let sumX = 0, sumY = 0, sumScale = 0, n = 0;
    for (const tag of tags) {
      const lm = getKeypoints(tag);
      if (!lm) continue;
      const lsh = lm[L_SHOULDER], rsh = lm[R_SHOULDER], nose = lm[NOSE];
      if (!lsh || !rsh) continue;
      // Mirror x to match body-lines convention.
      const midX = ((1 - lsh.x) + (1 - rsh.x)) * 0.5 * W;
      const midY = (nose ? (lsh.y + rsh.y + nose.y) / 3 : (lsh.y + rsh.y) * 0.5) * H;
      const shoulderW = Math.hypot(lsh.x - rsh.x, lsh.y - rsh.y) * W;
      sumX += midX;
      sumY += midY;
      sumScale += shoulderW;
      n++;
    }

    if (n === 0) {
      return { x: W * 0.5, y: H * 0.5, r: Math.min(W, H) * 0.35 };
    }

    // Mandala radius scales with body size. 3.5× shoulder width gives a
    // mandala that comfortably frames the performer without dwarfing them.
    return { x: sumX / n, y: sumY / n, r: (sumScale / n) * 3.5 };
  }

  // ---- Layer renderers ------------------------------------------------------

  /** Flower of Life: central circle + 6 circles around it, centres on a
   *  hex lattice at radius r. Drawn at low alpha as a ghostly base grid. */
  private drawFlowerOfLife(p: p5, r: number, hue: number, sat: number, bright: number): void {
    p.strokeWeight(1);
    p.stroke(hue, sat, bright, 30);
    // Central circle
    p.ellipse(0, 0, r * 2, r * 2);
    // 6 surrounding at 60° intervals, each centre at distance r
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      p.ellipse(x, y, r * 2, r * 2);
    }
  }

  /** Concentric rings pulsing with RMS — subtle breathing grid. */
  private drawConcentricRings(
    p: p5, R: number, count: number,
    hue: number, sat: number, bright: number, rms: number,
  ): void {
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const radius = R * t * (1 + rms * 0.08 * Math.sin(this.time * 2 + i));
      const alpha = 20 + (1 - t) * 30;
      p.strokeWeight(0.8);
      p.stroke((hue + i * 6) % 360, sat, bright, alpha);
      p.ellipse(0, 0, radius * 2, radius * 2);
    }
  }

  /** Straight radial lines from centre — N-fold spokes. */
  private drawSpokes(
    p: p5, R: number, N: number,
    hue: number, sat: number, bright: number,
  ): void {
    p.strokeWeight(1);
    p.stroke(hue, sat, bright, 50);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      p.line(0, 0, Math.cos(a) * R, Math.sin(a) * R);
    }
  }

  /** Regular N-gon outline. */
  private drawPolygon(
    p: p5, R: number, N: number, phase: number,
    hue: number, sat: number, bright: number, weight: number,
  ): void {
    p.strokeWeight(weight);
    p.stroke(hue, sat, bright, 75);
    p.beginShape();
    for (let i = 0; i < N; i++) {
      const a = phase + (i / N) * Math.PI * 2;
      p.vertex(Math.cos(a) * R, Math.sin(a) * R);
    }
    p.endShape(p.CLOSE);
  }

  /** {N / k} star polygon — vertex i connects to vertex (i + k) mod N.
   *  Produces interlocking star patterns classic to girih tilings. */
  private drawStarPolygon(
    p: p5, R: number, N: number, k: number,
    hue: number, sat: number, bright: number, weight: number,
  ): void {
    p.strokeWeight(weight);
    p.stroke(hue, sat, bright, 80);
    const verts: Pt[] = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI * 0.5;
      verts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
    }
    // Walk by k until we return to start (covers all verts when gcd(N,k)=1,
    // otherwise we draw multiple interlocking cycles — fine visually).
    const visited = new Set<number>();
    for (let start = 0; start < N && visited.size < N; start++) {
      if (visited.has(start)) continue;
      let cur = start;
      p.beginShape();
      do {
        visited.add(cur);
        p.vertex(verts[cur].x, verts[cur].y);
        cur = (cur + k) % N;
      } while (cur !== start);
      p.endShape(p.CLOSE);
    }
  }

  /** Inward-curving arc between each pair of adjacent spokes — gives
   *  the mandala its "petal" feel. Depth is 0..1 (fraction of R). */
  private drawPetalArcs(
    p: p5, R: number, N: number, depth: number,
    hue: number, sat: number, bright: number,
  ): void {
    p.strokeWeight(1.2);
    p.stroke(hue, sat, bright, 65);
    const step = (Math.PI * 2) / N;
    for (let i = 0; i < N; i++) {
      const a0 = i * step;
      const a1 = (i + 1) * step;
      const p0 = { x: Math.cos(a0) * R, y: Math.sin(a0) * R };
      const p1 = { x: Math.cos(a1) * R, y: Math.sin(a1) * R };
      const mid = {
        x: (p0.x + p1.x) * 0.5 * (1 - depth),
        y: (p0.y + p1.y) * 0.5 * (1 - depth),
      };
      // Quadratic bezier via 3-point curve: p0 → mid (pulled toward centre) → p1
      p.noFill();
      p.beginShape();
      p.vertex(p0.x, p0.y);
      (p as any).quadraticVertex(mid.x, mid.y, p1.x, p1.y);
      p.endShape();
    }
  }

  /** 2N-vertex pointed star alternating outer radius R / inner radius r. */
  private drawPointedStar(
    p: p5, R: number, r: number, N: number,
    hue: number, sat: number, bright: number,
  ): void {
    const clampedSat = Math.min(100, Math.max(0, sat));
    const clampedBright = Math.min(100, Math.max(0, bright));
    p.strokeWeight(1.5);
    p.stroke(hue % 360, clampedSat, clampedBright, 85);
    p.beginShape();
    const total = N * 2;
    for (let i = 0; i < total; i++) {
      const rad = i % 2 === 0 ? R : r;
      const a = (i / total) * Math.PI * 2 - Math.PI * 0.5;
      p.vertex(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    p.endShape(p.CLOSE);
  }
}
