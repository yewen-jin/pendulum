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

  // Phone XY pad — x: color temperature (0=cool/blue, 1=warm/red),
  //                 y: density/zoom (0=sparse/zoomed-out, 1=dense/zoomed-in)
  const phoneX = () => get('phone.x', 0.5);
  const phoneY = () => get('phone.y', 0.5);

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

  // Pose state weights (0→1, eased 600ms crossfade)
  const pCompact   = () => get('pose.state.compact');
  const pExpansive = () => get('pose.state.expansive');
  const pElevated  = () => get('pose.state.elevated');
  const pLeft      = () => get('pose.state.leftReach');
  const pRight     = () => get('pose.state.rightReach');

  if (mode === 'drift') {
    // Starfield + HUD. cc16=density, cc17=color, cc18=kaleid,
    // cc19=flow speed, cc20=modulation, cc22=rotation, cc25=brightness
    // Pose: compact→tighter/stiller, expansive→wider/grandiose,
    //   elevated→bright/saturated, reach→rotation bias
    // Phone: intensity→brightness+scroll energy, x→color temperature, y→density+scale
    noise(() => 14 + rms() * 8 - pCompact() * 4 + pExpansive() * 6 + phoneY() * 6, 0.05)
      .thresh(() => 0.88 - rms() * 0.15 - cc16() * 0.5 + pCompact() * 0.06 - pExpansive() * 0.08 - intensity() * 0.1)
      .brightness(() => -0.1 + cc25() * 0.3 + pElevated() * 0.2 + intensity() * 0.15)
      .color(
        () => 0.6 + centroid() * 0.4 + cc17() * 0.4 + pElevated() * 0.15 + phoneX() * 0.3,
        () => 0.75 + centroid() * 0.25 - cc17() * 0.3 + pElevated() * 0.1,
        () => 0.9 - centroid() * 0.3 + cc27() * 0.3 - phoneX() * 0.35
      )
      .modulate(
        voronoi(() => 6 + open() * 10 + pExpansive() * 6 - pCompact() * 3, 0.2, 0.1)
          .scrollY(0, () => -0.04 - rms() * 0.12 - cc19() * 0.15 - pExpansive() * 0.06 + pCompact() * 0.03 - intensity() * 0.08),
        () => 0.08 + motion() * 0.15 + cc20() * 0.3
      )
      .rotate(() => cc22() * 0.5 + pLeft() * 0.15 - pRight() * 0.15, () => cc22() * 0.02)
      .kaleid(() => 1 + cc18() * 6 + pExpansive() * 2)
      .add(
        shape(4, () => 0.003 + onset() * 0.01 + pElevated() * 0.005, 0.002)
          .color(0, 1, 0.4)
          .scale(() => 1 + onset() * 0.3 + pElevated() * 0.15),
        () => 0.35 * intensity()
      )
      .scale(() => 1 + motion() * 0.04 + cc23() * 0.5 + pExpansive() * 0.15 + phoneY() * 0.25)
      .out(o0);
  }

  if (mode === 'debris') {
    // Shards tumbling. cc16=density, cc20=warp, cc22=rotation,
    // cc19=speed, cc21=feedback, cc24=glitch
    // Pose: compact→fewer cells/slower, expansive→more/faster,
    //   elevated→intense modulation/glitch, reach→scroll bias
    // Phone: intensity→warp depth+scroll speed, x→color temperature, y→voronoi density+scale
    voronoi(() => 20 + rms() * 60 + cc16() * 40 - pCompact() * 15 + pExpansive() * 25 + phoneY() * 30, 0.3, 0.2)
      .thresh(() => 0.5 - rms() * 0.2 - cc25() * 0.2 + pCompact() * 0.1 - intensity() * 0.1)
      .mult(osc(() => 2 + centroid() * 8 + cc17() * 10, 0.1, 1).color(
        () => 0.9 + phoneX() * 0.15,
        () => 0.85,
        () => 0.8 - phoneX() * 0.3
      ))
      .modulate(noise(() => 2 + motion() * 6 + cc24() * 20 + pElevated() * 12, 0.3), () => 0.2 + cc20() * 0.5 + pElevated() * 0.25 + intensity() * 0.2)
      .rotate(() => 0.05 + open() * 0.2 + cc22() * 0.5 + pLeft() * 0.12 - pRight() * 0.12, () => cc22() * 0.03)
      .scrollY(() => (pLeft() - pRight()) * 0.05, () => -0.02 - rms() * 0.2 - cc19() * 0.2 - pExpansive() * 0.1 + pCompact() * 0.05 - intensity() * 0.12)
      .scale(() => 1 + cc23() * 0.5 + pExpansive() * 0.15 + phoneY() * 0.2)
      .out(o0);
  }

  if (mode === 'signalLoss') {
    // Broken CRT, tearing. cc24=glitch, cc26=pixelate,
    // cc16=static density, cc17=color, cc21=smear
    // Pose: compact→tighter scan/less noise, expansive→max tearing,
    //   elevated→full glitch/bright, reach→horizontal tear direction
    // Phone: intensity→static noise level+glitch amp, x→color temperature, y→pixelation+noise density
    osc(() => 60 + cc26() * 140 - pCompact() * 30 + pExpansive() * 50 + phoneY() * 60, 0.1, 1.2)
      .thresh(() => 0.5 - onset() * 0.3 - cc16() * 0.3 + pCompact() * 0.1 - pExpansive() * 0.1 - intensity() * 0.1)
      .color(
        () => 1 - cc17() * 0.5 + pElevated() * 0.2 + phoneX() * 0.2,
        () => 0.2 + cc17() * 0.4,
        () => 0.15 - phoneX() * 0.12
      )
      .modulate(
        noise(() => 40 + onset() * 120 + cc24() * 100 + pExpansive() * 60 + pElevated() * 80, () => 0.5 + rms() * 2)
      , () => 0.1 + onset() * 0.5 + cc21() * 0.4 + pElevated() * 0.3 + intensity() * 0.2)
      .add(
        noise(200, 1).luma(() => 0.6 - rms() - cc25() * 0.3 - pElevated() * 0.2),
        () => 0.3 + intensity() * 0.3
      )
      .scrollX(() => (pRight() - pLeft()) * 0.08, () => (Math.random() - 0.5) * (onset() + cc24() + pExpansive() * 0.4) * 0.3)
      .pixelate(
        () => 2000 - cc26() * 1950 - pExpansive() * 400 - phoneY() * 600,
        () => 2000 - cc26() * 1950 - pExpansive() * 400 - phoneY() * 600
      )
      .out(o0);
  }

  if (mode === 'reentry') {
    // Heat / atmosphere. cc16=shimmer, cc17=warmth, cc19=speed,
    // cc20=warp, cc23=zoom, cc22=rotation
    // Pose: compact→tight shimmer, expansive→wide atmospheric wash,
    //   elevated→peak bright/shape expand, reach→rotation direction
    // Phone: intensity→atmospheric warp+scroll, x→color temperature (warm↔cool), y→shimmer density+scale
    gradient(() => 0.2 + centroid() * 0.5 + cc16() * 0.3 + pCompact() * 0.15)
      .color(
        () => 0.9 + rms() * 0.1 + pElevated() * 0.1 + phoneX() * 0.15,
        () => 0.3 + centroid() * 0.4 - cc17() * 0.2 - phoneX() * 0.1,
        () => 0.1 + cc17() * 0.15 - phoneX() * 0.08
      )
      .modulate(
        noise(() => 3 + rms() * 12 + cc16() * 15 + pCompact() * 8 + pExpansive() * 5 + phoneY() * 8, () => 0.2 + motion() * 0.8)
      , () => 0.4 + cc20() * 0.5 + pExpansive() * 0.2 + pElevated() * 0.15 + intensity() * 0.2)
      .rotate(() => cc22() * 0.4 + pLeft() * 0.15 - pRight() * 0.15)
      .scrollY(0, () => -0.08 - rms() * 0.2 - cc19() * 0.15 - intensity() * 0.1)
      .layer(
        shape(3, () => 0.2 + open() * 0.3 + cc23() * 0.3 + pElevated() * 0.2, 0.05)
          .color(1, 0.95, 0.85)
          .luma(() => 0.3 - pElevated() * 0.15)
      )
      .scale(() => 1 + cc23() * 0.6 + pExpansive() * 0.2 - pCompact() * 0.1 + pElevated() * 0.12 + phoneY() * 0.25)
      .out(o0);
  }
}
