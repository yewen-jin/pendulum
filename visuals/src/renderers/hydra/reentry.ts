// Heat / atmosphere. cc16=shimmer, cc17=warmth, cc19=speed,
// cc20=warp, cc23=zoom, cc22=rotation
// Pose: compact→tight shimmer, expansive→wide atmospheric wash,
//   elevated→peak bright/shape expand, reach→rotation direction
// Phone: intensity→atmospheric warp+scroll, x→color temperature (warm↔cool), y→shimmer density+scale

import type { HydraScene } from './types';
import {
  rms, centroid, motion, openness,
  pCompact, pExpansive, pElevated, pLeft, pRight,
  intensity, phoneX, phoneY,
  cc16, cc17, cc19, cc20, cc22, cc23,
} from './signals';

export class ReentryScene implements HydraScene {
  readonly name = 'reentry';

  setup(_h: any): void {
    const g = globalThis as any;
    const { noise, shape, gradient, o0 } = g;

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
        shape(3, () => 0.2 + openness() * 0.3 + cc23() * 0.3 + pElevated() * 0.2, 0.05)
          .color(1, 0.95, 0.85)
          .luma(() => 0.3 - pElevated() * 0.15)
      )
      .scale(() => 1 + cc23() * 0.6 + pExpansive() * 0.2 - pCompact() * 0.1 + pElevated() * 0.12 + phoneY() * 0.25)
      .out(o0);
  }
}
