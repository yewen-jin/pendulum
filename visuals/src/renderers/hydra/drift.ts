// Starfield + HUD. cc16=density, cc17=color, cc18=kaleid,
// cc19=flow speed, cc20=modulation, cc22=rotation, cc25=brightness
// Pose: compact→tighter/stiller, expansive→wider/grandiose,
//   elevated→bright/saturated, reach→rotation bias
// Phone: intensity→brightness+scroll energy, x→color temperature, y→density+scale

import type { HydraScene } from './types';
import {
  rms, centroid, motion, openness, onset,
  pCompact, pExpansive, pElevated, pLeft, pRight,
  intensity, phoneX, phoneY,
  cc16, cc17, cc18, cc19, cc20, cc22, cc23, cc25, cc27,
} from './signals';

export class DriftScene implements HydraScene {
  readonly name = 'drift';

  setup(_h: any): void {
    const g = globalThis as any;
    const { noise, voronoi, shape, o0 } = g;

    noise(() => 14 + rms() * 8 - pCompact() * 4 + pExpansive() * 6 + phoneY() * 6, 0.05)
      .thresh(() => 0.88 - rms() * 0.15 - cc16() * 0.5 + pCompact() * 0.06 - pExpansive() * 0.08 - intensity() * 0.1)
      .brightness(() => -0.1 + cc25() * 0.3 + pElevated() * 0.2 + intensity() * 0.15)
      .color(
        () => 0.6 + centroid() * 0.4 + cc17() * 0.4 + pElevated() * 0.15 + phoneX() * 0.3,
        () => 0.75 + centroid() * 0.25 - cc17() * 0.3 + pElevated() * 0.1,
        () => 0.9 - centroid() * 0.3 + cc27() * 0.3 - phoneX() * 0.35
      )
      .modulate(
        voronoi(() => 6 + openness() * 10 + pExpansive() * 6 - pCompact() * 3, 0.2, 0.1)
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
}
