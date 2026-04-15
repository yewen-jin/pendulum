import Hydra from 'hydra-synth';
import { applyMode, MODES, type ModeName } from './scenes';
import type { Renderer } from '../types';

export class HydraRenderer implements Renderer {
  readonly name = 'hydra';
  readonly scenes: string[] = [...MODES];
  private h: any = null;
  private canvas: HTMLCanvasElement | null = null;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    canvas.width = 1920;
    canvas.height = 1080;
    this.h = new Hydra({ canvas, detectAudio: false, makeGlobal: true });
  }

  applyScene(scene: string): void {
    if (!MODES.includes(scene as ModeName)) return;
    applyMode(this.h, scene as ModeName);
  }

  tick(): void {
    // Hydra runs its own rAF internally — nothing to do
  }

  destroy(): void {
    // Hydra's raf-loop handle is never stored (hydra-synth.js:124)
    // so we can't stop it. The director replaces the canvas element
    // on cross-renderer switch, so the orphaned loop renders to a
    // detached canvas that will be GC'd. Just drop our references.
    this.h = null;
    this.canvas = null;
  }
}
