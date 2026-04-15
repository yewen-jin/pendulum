import type p5 from 'p5';
import { get, pulse } from '../../bus';
import { getKeypointsSmoothed, getActiveTags } from '../../mediapipe';
import type { P5Scene } from './types';

// Strict Islamic geometric tessellation.
//
// Construction (no decorative cliché — straight lines, circles, integer
// star-skip, regular tilings):
//
//   1. Hex (or square) lattice of cell centres at spacing L.
//   2. At each centre, a regular n-pointed STAR POLYGON {n/k}: the n
//      vertices lie on a circle of radius R, and the n line segments
//      connect vertex i → vertex (i+k) mod n.
//   3. Outer n-gon outline shares the same n vertices — endpoints
//      coincide exactly (no float drift).
//   4. Inner n-gon at the analytic intersection radius
//        r_inner = R · cos(π·k/n) / cos(π/n)
//      placed at the half-step angles where {n/k} segments cross.
//   5. R = L/2 so vertex-to-vertex contact between adjacent cells is
//      exact (hex: 6 neighbours touch when n is a multiple of 6;
//      square: 4 cardinal neighbours touch when n is a multiple of 4).
//
// Pose state changes the math parameters live:
//   - elevated  →  raises n  (6 → 12 → 8/square)  [pattern family]
//   - cc18 also chooses n      (knob path to family)
//   - compact   →  lowers k   (sparser, sharper stars)
//   - expansive →  raises k   (denser strapwork)
//   - rms       →  breathes L (cell size pulses with audio)
//   - motion + cc19 + onset → lattice rotation rate Φ
//   - leftReach − rightReach → lattice shear ψ (hex → rhombic)
//   - centroid + cc17 + time → hue
//   - openness  → centre dot scale

const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12;

type Pt = { x: number; y: number };

export class SacredGeometryScene implements P5Scene {
  readonly name = 'sacredGeometry';
  private time = 0;
  // Smoothed cell size and anchor so parameter shifts glide.
  private cellSize = 180;
  private cx = 0;
  private cy = 0;

  setup(p: p5): void {
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.noFill();
    p.strokeCap(p.SQUARE);
    p.strokeJoin(p.MITER);
    this.cx = p.width * 0.5;
    this.cy = p.height * 0.5;
  }

  draw(p: p5, dt: number): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;

    // ---- Signals ----
    const rms = get('audio.rms');
    const centroid = get('audio.centroid', 0.3);
    const onset = pulse('audio.onset');
    const motion = get('pose.motion');
    const openness = get('pose.openness');
    const compact = get('pose.state.compact');
    const expansive = get('pose.state.expansive');
    const elevated = get('pose.state.elevated');
    const leftReach = get('pose.state.leftReach');
    const rightReach = get('pose.state.rightReach');

    const cc16 = get('midi.cc.16'); // density (k bias)
    const cc17 = get('midi.cc.17'); // hue
    const cc18 = get('midi.cc.18'); // family (n)
    const cc19 = get('midi.cc.19'); // rotation rate
    const cc21 = get('midi.cc.21'); // trail
    const cc23 = get('midi.cc.23'); // cell scale
    const cc25 = get('midi.cc.25'); // brightness

    // ---- Trail ----
    const bgAlpha = 100 - cc21 * 94;
    p.background(0, 0, 0, bgAlpha);

    // ---- Family selection: integer n + lattice ----
    // elevated lifts to 12-fold; cc18 high pushes to 8-fold (square).
    let n: number;
    let lattice: 'hex' | 'square';
    if (cc18 > 0.66) { n = 8; lattice = 'square'; }
    else if (elevated > 0.5 || cc18 > 0.33) { n = 12; lattice = 'hex'; }
    else { n = 6; lattice = 'hex'; }

    // ---- Star skip k: integer in [2, ⌊n/2⌋ − ε] ----
    const kMax = Math.max(2, Math.floor((n - 1) / 2));
    const kFloat = 2 + (0.2 + expansive * 0.7 + cc16 * 0.6 - compact * 0.4) * (kMax - 2);
    const k = Math.max(2, Math.min(kMax, Math.round(kFloat)));

    // ---- Cell size L ----
    const anchor = this.computeAnchor(p);
    this.cx += (anchor.x - this.cx) * 0.08;
    this.cy += (anchor.y - this.cy) * 0.08;
    const targetL = anchor.cellSize * (0.7 + cc23 * 1.0) * (1 + rms * 0.12 + onset * 0.18);
    this.cellSize += (targetL - this.cellSize) * 0.08;
    const L = Math.max(60, this.cellSize);
    const R = L * 0.5;

    // ---- Lattice rotation Φ and skew ψ ----
    const Phi = this.time * (0.12 + cc19 * 0.8 + motion * 0.4) + onset * 0.4;
    const skew = (leftReach - rightReach) * 0.25;

    // ---- Colour ----
    const baseHue = (centroid * 80 + cc17 * 360 + this.time * 5) % 360;
    const sat = 25 + rms * 45 + expansive * 20;
    const bright = 50 + cc25 * 40 + rms * 15 + elevated * 15 + onset * 25;

    // ---- Draw lattice ----
    p.push();
    p.translate(this.cx, this.cy);
    p.rotate(Phi);

    // Cover the rotated screen rect — diagonal × 0.6 + margin keeps
    // corners filled at any rotation.
    const reach = Math.hypot(p.width, p.height) * 0.6 + L * 2;
    const points = lattice === 'hex'
      ? this.hexLattice(L, reach, skew)
      : this.squareLattice(L, reach, skew);

    for (const pt of points) {
      this.drawCell(p, pt.x, pt.y, R, n, k, baseHue, sat, bright, openness, onset);
    }

    p.pop();

    // ---- Onset bell-ring (un-rotated, anchor-centred) ----
    if (onset > 0.05) {
      const burstR = L * (0.6 + onset * 2.2);
      p.strokeWeight(onset * 3);
      p.stroke((baseHue + 60) % 360, 30, 100, onset * 80);
      p.ellipse(this.cx, this.cy, burstR * 2, burstR * 2);
    }
  }

  resize(p: p5, _w: number, _h: number): void {
    this.cx = p.width * 0.5;
    this.cy = p.height * 0.5;
  }

  dispose(): void {
    this.time = 0;
  }

  // ---- Lattice generators ---------------------------------------------------

  /** Hex lattice: rows offset by L/2, row height L·√3/2.
   *  Skew shifts each row horizontally by skew·L per row index. */
  private hexLattice(L: number, reach: number, skew: number): Pt[] {
    const rowH = L * Math.sqrt(3) / 2;
    const cols = Math.ceil(reach / L) + 1;
    const rows = Math.ceil(reach / rowH) + 1;
    const pts: Pt[] = [];
    for (let j = -rows; j <= rows; j++) {
      for (let i = -cols; i <= cols; i++) {
        const x = i * L + ((j & 1) ? L * 0.5 : 0) + j * skew * L;
        const y = j * rowH;
        pts.push({ x, y });
      }
    }
    return pts;
  }

  /** Square lattice. Skew turns squares into rhombi. */
  private squareLattice(L: number, reach: number, skew: number): Pt[] {
    const cols = Math.ceil(reach / L) + 1;
    const pts: Pt[] = [];
    for (let j = -cols; j <= cols; j++) {
      for (let i = -cols; i <= cols; i++) {
        pts.push({ x: i * L + j * skew * L, y: j * L });
      }
    }
    return pts;
  }

  // ---- Single cell ---------------------------------------------------------

  /** Draw one cell: regular n-gon outline, {n/k} star polygon as discrete
   *  segments, and the analytically-placed inner n-gon. All three share
   *  the same vertex set on the outer circle of radius R, so endpoints
   *  coincide exactly (no float drift, no off-line vertices). */
  private drawCell(
    p: p5, cx: number, cy: number, R: number,
    n: number, k: number,
    hue: number, sat: number, bright: number,
    openness: number, onset: number,
  ): void {
    // Precompute outer vertices
    const verts: Pt[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      verts[i] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
    }

    // Outer n-gon
    p.stroke(hue % 360, sat * 0.6, Math.min(100, bright * 0.7), 38);
    p.strokeWeight(0.8);
    p.beginShape();
    for (let i = 0; i < n; i++) p.vertex(verts[i].x, verts[i].y);
    p.endShape(p.CLOSE);

    // {n/k} star polygon as discrete line segments — endpoints exactly
    // hit the outer vertices (zero float drift from a closed shape walk).
    p.stroke((hue + 30) % 360, Math.min(100, sat), Math.min(100, bright), 85 + onset * 15);
    p.strokeWeight(1.3);
    for (let i = 0; i < n; i++) {
      const a = verts[i];
      const b = verts[(i + k) % n];
      p.line(a.x, a.y, b.x, b.y);
    }

    // Inner n-gon at the analytic intersection radius:
    //   r_inner / R = cos(π·k/n) / cos(π/n)
    // and angularly offset by half a step + (k−1)·step/2 so the
    // vertices land exactly on the {n/k} self-intersections.
    if (k >= 2 && k < n) {
      const innerR = R * Math.cos(Math.PI * k / n) / Math.cos(Math.PI / n);
      p.stroke((hue + 60) % 360, Math.min(100, sat), Math.min(100, bright), 55);
      p.strokeWeight(0.8);
      p.beginShape();
      for (let i = 0; i < n; i++) {
        const a = ((2 * i + k + 1) / (2 * n)) * Math.PI * 2;
        p.vertex(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
      }
      p.endShape(p.CLOSE);
    }

    // Centre dot
    p.noStroke();
    p.fill((hue + 200) % 360, Math.min(100, sat + 20), Math.min(100, bright + 10), 65);
    const dotR = R * 0.06 * (1 + openness * 0.6 + onset * 0.4);
    p.ellipse(cx, cy, dotR * 2, dotR * 2);
    p.noFill();
  }

  // ---- Anchor --------------------------------------------------------------

  private computeAnchor(p: p5): { x: number; y: number; cellSize: number } {
    const tags = getActiveTags();
    const W = p.width, H = p.height;
    let sumX = 0, sumY = 0, sumScale = 0, n = 0;
    for (const tag of tags) {
      const lm = getKeypointsSmoothed(tag);
      if (!lm) continue;
      const lsh = lm[L_SHOULDER], rsh = lm[R_SHOULDER], nose = lm[NOSE];
      if (!lsh || !rsh) continue;
      const midX = ((1 - lsh.x) + (1 - rsh.x)) * 0.5 * W;
      const midY = (nose ? (lsh.y + rsh.y + nose.y) / 3 : (lsh.y + rsh.y) * 0.5) * H;
      const shoulderW = Math.hypot(lsh.x - rsh.x, lsh.y - rsh.y) * W;
      sumX += midX; sumY += midY; sumScale += shoulderW; n++;
    }
    if (n === 0) {
      return { x: W * 0.5, y: H * 0.5, cellSize: Math.min(W, H) * 0.18 };
    }
    // Cell size proportional to body. 1.4× shoulder gives a dense
    // tessellation when performers are close to camera.
    return { x: sumX / n, y: sumY / n, cellSize: (sumScale / n) * 1.4 };
  }
}
