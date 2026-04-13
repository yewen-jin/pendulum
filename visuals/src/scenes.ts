// Hydra patches. Each mode is a function that (re)patches the global Hydra
// `h` instance. Parameters are closed over `get/pulse` from the bus so they
// update every frame without having to re-patch.

import { get, pulse } from './bus';

export type ModeName = 'drift' | 'debris' | 'signalLoss' | 'reentry';

export const MODES: ModeName[] = ['drift', 'debris', 'signalLoss', 'reentry'];

// Hydra injects functions like osc, noise, solid, voronoi, src, shape, etc.
// into globalThis when instantiated. We treat `h` as any for simplicity.
export function applyMode(h: any, mode: ModeName) {
  const g = globalThis as any;
  const { osc, noise, voronoi, shape, src, solid, o0, s0, gradient } = g;

  // Common reactive scalars
  const rms = () => get('audio.rms');
  const centroid = () => get('audio.centroid', 0.3);
  const motion = () => get('pose.motion');
  const open = () => get('pose.openness');
  const intensity = () => get('phone.intensity', 0.6);
  const onset = () => pulse('audio.onset');

  if (mode === 'drift') {
    // Default reactive base: slow flowing starfield + faint HUD crosshair.
    noise(() => 14 + rms() * 8, 0.05)
      .thresh(() => 0.88 - rms() * 0.15)
      .color(
        () => 0.6 + centroid() * 0.4,
        () => 0.75 + centroid() * 0.25,
        () => 0.9 - centroid() * 0.3
      )
      .modulate(
        voronoi(() => 6 + open() * 10, 0.2, 0.1)
          .scrollY(0, () => -0.04 - rms() * 0.12),
        () => 0.08 + motion() * 0.15
      )
      .add(
        shape(4, () => 0.003 + onset() * 0.01, 0.002)
          .color(0, 1, 0.4)
          .scale(() => 1 + onset() * 0.3),
        () => 0.35 * intensity()
      )
      .scale(1, () => 1 + motion() * 0.04)
      .out(o0);
  }

  if (mode === 'debris') {
    // Shards of geometry tumbling toward camera.
    voronoi(() => 20 + rms() * 60, 0.3, 0.2)
      .thresh(() => 0.5 - rms() * 0.2)
      .mult(osc(() => 2 + centroid() * 8, 0.1, 1).color(0.9, 0.85, 0.8))
      .modulate(noise(() => 2 + motion() * 6, 0.3), 0.2)
      .rotate(() => 0.05 + open() * 0.2, 0.1)
      .scrollY(0, () => -0.02 - rms() * 0.2)
      .out(o0);
  }

  if (mode === 'signalLoss') {
    // Broken CRT, tearing, static.
    osc(60, 0.1, 1.2)
      .thresh(() => 0.5 - onset() * 0.3)
      .color(1, 0.2, 0.15)
      .modulate(
        noise(() => 40 + onset() * 120, () => 0.5 + rms() * 2)
      , () => 0.1 + onset() * 0.5)
      .add(
        noise(200, 1).luma(() => 0.6 - rms()),
        () => 0.3 + intensity() * 0.3
      )
      .scrollX(0, () => (Math.random() - 0.5) * onset() * 0.3)
      .out(o0);
  }

  if (mode === 'reentry') {
    // Heat / atmospheric entry: warm gradient, shimmering boundary.
    gradient(() => 0.2 + centroid() * 0.5)
      .color(
        () => 0.9 + rms() * 0.1,
        () => 0.3 + centroid() * 0.4,
        () => 0.1
      )
      .modulate(
        noise(() => 3 + rms() * 12, () => 0.2 + motion() * 0.8)
      , 0.4)
      .scrollY(0, () => -0.08 - rms() * 0.2)
      .layer(
        shape(3, () => 0.2 + open() * 0.3, 0.05)
          .color(1, 0.95, 0.85)
          .luma(0.3)
      )
      .out(o0);
  }
}
