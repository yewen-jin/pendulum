import type p5 from 'p5';
import { get, pulse } from '../../bus';
import type { P5Scene } from './types';

// Abstract upper-body figure drawn as squiggly organic curves.
// Pose states shape the figure, audio drives the squiggle energy,
// MIDI CCs modulate visual properties.

const SPINE_POINTS = 40;
const ARM_POINTS = 30;

export class BodyLinesScene implements P5Scene {
  readonly name = 'bodyLines';
  private time = 0;

  setup(p: p5): void {
    p.colorMode(p.HSB, 360, 100, 100, 100);
    p.strokeCap(p.ROUND);
    p.strokeJoin(p.ROUND);
  }

  draw(p: p5, dt: number): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;

    // ---- Read bus signals ----
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
    const intensity = get('phone.intensity', 0.6);
    const mouthOpen = get('face.mouthOpen');
    const browUp = get('face.browUp');

    const cc17 = get('midi.cc.17');  // color shift
    const cc19 = get('midi.cc.19');  // flow speed
    const cc20 = get('midi.cc.20');  // turbulence / squiggle
    const cc21 = get('midi.cc.21');  // trail / smear
    const cc22 = get('midi.cc.22');  // rotation
    const cc25 = get('midi.cc.25');  // brightness

    // ---- Derived values ----
    const w = p.width;
    const h = p.height;
    const cx = w * 0.5;
    const cy = h * 0.5;

    // Figure scale: compact shrinks, expansive grows
    const scale = (0.6 + expansive * 0.5 - compact * 0.2 + intensity * 0.2) * Math.min(w, h) * 0.35;

    // Squiggle amplitude: motion + audio + turbulence CC
    const squiggle = (0.3 + motion * 2.0 + rms * 1.5 + cc20 * 3.0) * scale * 0.04;

    // Flow speed
    const flow = (1.0 + cc19 * 3.0 + motion * 2.0) * 2.0;

    // Vertical offset: elevated lifts the figure
    const yOff = -elevated * scale * 0.3;

    // Hue: centroid drives base hue, cc17 shifts it
    const baseHue = (centroid * 120 + cc17 * 360 + this.time * 20) % 360;

    // Brightness
    const bright = 50 + cc25 * 40 + rms * 20 + elevated * 15;

    // ---- Background with trail ----
    // cc21 controls trail: 0 = full clear, 1 = heavy trail
    const bgAlpha = 100 - cc21 * 92;
    p.background(0, 0, 0, bgAlpha);

    // ---- Rotation ----
    p.push();
    p.translate(cx, cy + yOff);
    p.rotate(cc22 * p.TWO_PI * 0.25);

    // ---- Draw figure ----
    const lineWeight = 1.5 + rms * 4 + onset * 6;

    // Spine: vertical center line
    this.drawSquigglyLine(
      p, 0, -scale * 0.5, 0, scale * 0.4,
      SPINE_POINTS, squiggle, flow, baseHue, bright, lineWeight, 0
    );

    // Arms: spread based on openness and reach
    const armSpread = 0.3 + openness * 0.6 + expansive * 0.3;
    const shoulderY = -scale * 0.25;

    // Left arm
    const leftAngle = -p.HALF_PI - (armSpread + leftReach * 0.5) * 0.8;
    const leftLen = scale * (0.4 + leftReach * 0.3 + expansive * 0.15);
    this.drawSquigglyLine(
      p, 0, shoulderY,
      Math.cos(leftAngle) * leftLen, shoulderY + Math.sin(leftAngle) * leftLen,
      ARM_POINTS, squiggle * 1.2, flow * 1.1, (baseHue + 40) % 360, bright, lineWeight * 0.8, 1
    );

    // Right arm
    const rightAngle = -p.HALF_PI + (armSpread + rightReach * 0.5) * 0.8;
    const rightLen = scale * (0.4 + rightReach * 0.3 + expansive * 0.15);
    this.drawSquigglyLine(
      p, 0, shoulderY,
      Math.cos(rightAngle) * rightLen, shoulderY + Math.sin(rightAngle) * rightLen,
      ARM_POINTS, squiggle * 1.2, flow * 1.1, (baseHue + 40) % 360, bright, lineWeight * 0.8, 2
    );

    // Shoulder crossbar
    this.drawSquigglyLine(
      p, -scale * 0.25 - expansive * scale * 0.1, shoulderY,
      scale * 0.25 + expansive * scale * 0.1, shoulderY,
      20, squiggle * 0.6, flow * 0.8, (baseHue + 20) % 360, bright * 0.8, lineWeight * 0.6, 3
    );

    // Head: circle at top, opens with mouth
    const headY = -scale * 0.55 - browUp * scale * 0.08;
    const headR = scale * 0.1 * (1 + browUp * 0.3);
    this.drawSquigglyCircle(
      p, 0, headY, headR, mouthOpen,
      squiggle * 0.8, flow, (baseHue + 80) % 360, bright, lineWeight * 0.7
    );

    // Hip crossbar (compact brings it in)
    const hipW = scale * (0.15 + expansive * 0.1 - compact * 0.05);
    this.drawSquigglyLine(
      p, -hipW, scale * 0.3, hipW, scale * 0.3,
      15, squiggle * 0.5, flow * 0.7, (baseHue + 60) % 360, bright * 0.7, lineWeight * 0.5, 4
    );

    // Onset flash: expanding ring
    if (onset > 0.05) {
      const flashR = scale * 0.3 * (1 + onset * 2);
      p.noFill();
      p.stroke(baseHue, 30, 100, onset * 80);
      p.strokeWeight(onset * 8);
      p.ellipse(0, 0, flashR * 2, flashR * 2);
    }

    p.pop();
  }

  resize(_p: p5, _w: number, _h: number): void {
    // Layout is responsive via p.width/p.height in draw()
  }

  dispose(): void {
    this.time = 0;
  }

  // ---- Drawing helpers ----

  private drawSquigglyLine(
    p: p5, x1: number, y1: number, x2: number, y2: number,
    points: number, amp: number, speed: number,
    hue: number, bright: number, weight: number, seed: number
  ): void {
    p.noFill();
    p.strokeWeight(weight);
    p.beginShape();
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      const x = p.lerp(x1, x2, t);
      const y = p.lerp(y1, y2, t);

      // Perpendicular offset for squiggle
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const noiseVal = Math.sin(t * 12 + this.time * speed + seed * 7.3)
        * Math.cos(t * 8.5 + this.time * speed * 0.7 + seed * 3.1);
      const offset = noiseVal * amp * (1 - Math.abs(t - 0.5) * 1.2); // taper at ends

      // Color varies along the line
      const h = (hue + t * 30) % 360;
      p.stroke(h, 60 + t * 20, bright, 70 + t * 20);

      (p as any).curveVertex(x + nx * offset, y + ny * offset);
    }
    p.endShape();
  }

  private drawSquigglyCircle(
    p: p5, cx: number, cy: number, radius: number, openAmount: number,
    amp: number, speed: number, hue: number, bright: number, weight: number
  ): void {
    p.noFill();
    p.strokeWeight(weight);
    p.stroke(hue, 50, bright, 80);

    // Gap at bottom for mouth opening
    const gapAngle = openAmount * p.PI * 0.6;
    const startAngle = gapAngle * 0.5 + p.HALF_PI;
    const endAngle = p.TWO_PI - gapAngle * 0.5 + p.HALF_PI;

    p.beginShape();
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = p.lerp(startAngle, endAngle, t);
      const noiseVal = Math.sin(angle * 5 + this.time * speed)
        * Math.cos(angle * 3.7 + this.time * speed * 0.6);
      const r = radius + noiseVal * amp;
      (p as any).curveVertex(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
    p.endShape();
  }
}
