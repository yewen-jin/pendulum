// Shards tumbling. cc16=density, cc20=warp, cc22=rotation,
// cc19=speed, cc21=feedback, cc24=glitch
// Pose: compact→fewer cells/slower, expansive→more/faster,
//   elevated→intense modulation/glitch, reach→scroll bias
// Phone: intensity→warp depth+scroll speed, x→color temperature, y→voronoi density+scale

import type { HydraScene } from './types';
import {
  rms, centroid, motion, openness,
  pCompact, pExpansive, pElevated, pLeft, pRight,
  intensity, phoneX, phoneY,
  cc16, cc17, cc19, cc20, cc22, cc23, cc24, cc25,
} from './signals';

export class DebrisScene implements HydraScene {
  readonly name = 'debris';

  setup(_h: any): void {
    const g = globalThis as any;
    const { osc, noise, voronoi, o0 } = g;

    voronoi(() => 20 + rms() * 60 + cc16() * 40 - pCompact() * 15 + pExpansive() * 25 + phoneY() * 30, 0.3, 0.2)
      .thresh(() => 0.5 - rms() * 0.2 - cc25() * 0.2 + pCompact() * 0.1 - intensity() * 0.1)
      .mult(osc(() => 2 + centroid() * 8 + cc17() * 10, 0.1, 1).color(
        () => 0.9 + phoneX() * 0.15,
        () => 0.85,
        () => 0.8 - phoneX() * 0.3
      ))
      .modulate(noise(() => 2 + motion() * 6 + cc24() * 20 + pElevated() * 12, 0.3), () => 0.2 + cc20() * 0.5 + pElevated() * 0.25 + intensity() * 0.2)
      .rotate(() => 0.05 + openness() * 0.2 + cc22() * 0.5 + pLeft() * 0.12 - pRight() * 0.12, () => cc22() * 0.03)
      .scrollY(() => (pLeft() - pRight()) * 0.05, () => -0.02 - rms() * 0.2 - cc19() * 0.2 - pExpansive() * 0.1 + pCompact() * 0.05 - intensity() * 0.12)
      .scale(() => 1 + cc23() * 0.5 + pExpansive() * 0.15 + phoneY() * 0.2)
      .out(o0);
  }
}
