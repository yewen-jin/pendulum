// Shared bus reader helpers for Hydra scenes. Each is a zero-arg
// function so scene chains can close over them — values refresh
// every frame without re-patching.

import { get, pulse } from '../../bus';

// Audio
export const rms = () => get('audio.rms');
export const centroid = () => get('audio.centroid', 0.3);
export const onset = () => pulse('audio.onset');

// Pose (continuous)
export const motion = () => get('pose.motion');
export const openness = () => get('pose.openness');

// Pose state weights (0→1, eased 600ms crossfade)
export const pCompact   = () => get('pose.state.compact');
export const pExpansive = () => get('pose.state.expansive');
export const pElevated  = () => get('pose.state.elevated');
export const pLeft      = () => get('pose.state.leftReach');
export const pRight     = () => get('pose.state.rightReach');

// Phone XY pad — x: color temperature (0=cool/blue, 1=warm/red),
//                 y: density/zoom (0=sparse/zoomed-out, 1=dense/zoomed-in)
export const intensity = () => get('phone.intensity', 0.6);
export const phoneX    = () => get('phone.x', 0.5);
export const phoneY    = () => get('phone.y', 0.5);

// MIDI CC 16–31 on channel 2. Shared across all scenes —
// each scene picks a subset so every knob does something visible.
export const cc16 = () => get('midi.cc.16');   // density / threshold
export const cc17 = () => get('midi.cc.17');   // color shift
export const cc18 = () => get('midi.cc.18');   // kaleidoscope / symmetry
export const cc19 = () => get('midi.cc.19');   // scroll / flow speed
export const cc20 = () => get('midi.cc.20');   // modulation depth
export const cc21 = () => get('midi.cc.21');   // feedback / smear
export const cc22 = () => get('midi.cc.22');   // rotation
export const cc23 = () => get('midi.cc.23');   // scale / zoom
export const cc24 = () => get('midi.cc.24');   // glitch amount
export const cc25 = () => get('midi.cc.25');   // brightness / luma
export const cc26 = () => get('midi.cc.26');   // pixelate / resolution
export const cc27 = () => get('midi.cc.27');   // hue rotate
