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

  // MIDI CC 16–31 on channel 2. Shared across all scenes —
  // each scene picks a subset so every knob does something visible.
  const cc16 = () => get('midi.cc.16');   // density / threshold
  const cc17 = () => get('midi.cc.17');   // color shift
  const cc18 = () => get('midi.cc.18');   // kaleidoscope / symmetry
  const cc19 = () => get('midi.cc.19');   // scroll / flow speed
  const cc20 = () => get('midi.cc.20');   // modulation depth
  const cc21 = () => get('midi.cc.21');   // feedback / smear
  const cc22 = () => get('midi.cc.22');   // rotation
  const cc23 = () => get('midi.cc.23');   // scale / zoom
  const cc24 = () => get('midi.cc.24');   // glitch amount
  const cc25 = () => get('midi.cc.25');   // brightness / luma
  const cc26 = () => get('midi.cc.26');   // pixelate / resolution
  const cc27 = () => get('midi.cc.27');   // hue rotate
  const cc28 = () => get('midi.cc.28');   // spare
  const cc29 = () => get('midi.cc.29');   // spare
  const cc30 = () => get('midi.cc.30');   // spare
  const cc31 = () => get('midi.cc.31');   // spare

  if (mode === 'drift') {
    // Starfield + HUD. cc16=density, cc17=color, cc18=kaleid,
    // cc19=flow speed, cc20=modulation, cc22=rotation, cc25=brightness
    noise(() => 14 + rms() * 8, 0.05)
      .thresh(() => 0.88 - rms() * 0.15 - cc16() * 0.5)
      .brightness(() => -0.1 + cc25() * 0.3)
      .color(
        () => 0.6 + centroid() * 0.4 + cc17() * 0.4,
        () => 0.75 + centroid() * 0.25 - cc17() * 0.3,
        () => 0.9 - centroid() * 0.3 + cc27() * 0.3
      )
      .modulate(
        voronoi(() => 6 + open() * 10, 0.2, 0.1)
          .scrollY(0, () => -0.04 - rms() * 0.12 - cc19() * 0.15),
        () => 0.08 + motion() * 0.15 + cc20() * 0.3
      )
      .rotate(() => cc22() * 0.5, () => cc22() * 0.02)
      .kaleid(() => 1 + cc18() * 6)
      .add(
        shape(4, () => 0.003 + onset() * 0.01, 0.002)
          .color(0, 1, 0.4)
          .scale(() => 1 + onset() * 0.3),
        () => 0.35 * intensity()
      )
      .scale(() => 1 + motion() * 0.04 + cc23() * 0.5)
      .out(o0);
  }

  if (mode === 'debris') {
    // Shards tumbling. cc16=density, cc20=warp, cc22=rotation,
    // cc19=speed, cc21=feedback, cc24=glitch
    voronoi(() => 20 + rms() * 60 + cc16() * 40, 0.3, 0.2)
      .thresh(() => 0.5 - rms() * 0.2 - cc25() * 0.2)
      .mult(osc(() => 2 + centroid() * 8 + cc17() * 10, 0.1, 1).color(0.9, 0.85, 0.8))
      .modulate(noise(() => 2 + motion() * 6 + cc24() * 20, 0.3), () => 0.2 + cc20() * 0.5)
      .rotate(() => 0.05 + open() * 0.2 + cc22() * 0.5, () => cc22() * 0.03)
      .scrollY(0, () => -0.02 - rms() * 0.2 - cc19() * 0.2)
      .scale(() => 1 + cc23() * 0.5)
      .out(o0);
  }

  if (mode === 'signalLoss') {
    // Broken CRT, tearing. cc24=glitch, cc26=pixelate,
    // cc16=static density, cc17=color, cc21=smear
    osc(() => 60 + cc26() * 140, 0.1, 1.2)
      .thresh(() => 0.5 - onset() * 0.3 - cc16() * 0.3)
      .color(() => 1 - cc17() * 0.5, () => 0.2 + cc17() * 0.4, 0.15)
      .modulate(
        noise(() => 40 + onset() * 120 + cc24() * 100, () => 0.5 + rms() * 2)
      , () => 0.1 + onset() * 0.5 + cc21() * 0.4)
      .add(
        noise(200, 1).luma(() => 0.6 - rms() - cc25() * 0.3),
        () => 0.3 + intensity() * 0.3
      )
      .scrollX(0, () => (Math.random() - 0.5) * (onset() + cc24()) * 0.3)
      .pixelate(() => 2000 - cc26() * 1950, () => 2000 - cc26() * 1950)
      .out(o0);
  }

  if (mode === 'reentry') {
    // Heat / atmosphere. cc16=shimmer, cc17=warmth, cc19=speed,
    // cc20=warp, cc23=zoom, cc22=rotation
    gradient(() => 0.2 + centroid() * 0.5 + cc16() * 0.3)
      .color(
        () => 0.9 + rms() * 0.1,
        () => 0.3 + centroid() * 0.4 - cc17() * 0.2,
        () => 0.1 + cc17() * 0.15
      )
      .modulate(
        noise(() => 3 + rms() * 12 + cc16() * 15, () => 0.2 + motion() * 0.8)
      , () => 0.4 + cc20() * 0.5)
      .rotate(() => cc22() * 0.4)
      .scrollY(0, () => -0.08 - rms() * 0.2 - cc19() * 0.15)
      .layer(
        shape(3, () => 0.2 + open() * 0.3 + cc23() * 0.3, 0.05)
          .color(1, 0.95, 0.85)
          .luma(0.3)
      )
      .scale(() => 1 + cc23() * 0.6)
      .out(o0);
  }
}
