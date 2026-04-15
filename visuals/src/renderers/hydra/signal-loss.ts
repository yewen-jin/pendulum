// Broken CRT, tearing. cc24=glitch, cc26=pixelate,
// cc16=static density, cc17=color, cc21=smear
// Pose: compact→tighter scan/less noise, expansive→max tearing,
//   elevated→full glitch/bright, reach→horizontal tear direction
// Phone: intensity→static noise level+glitch amp, x→color temperature, y→pixelation+noise density

import type { HydraScene } from './types';
import {
  rms, onset,
  pCompact, pExpansive, pElevated, pLeft, pRight,
  intensity, phoneX, phoneY,
  cc16, cc17, cc21, cc24, cc25, cc26,
} from './signals';

export class SignalLossScene implements HydraScene {
  readonly name = 'signalLoss';

  setup(_h: any): void {
    const g = globalThis as any;
    const { osc, noise, o0 } = g;

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
}
