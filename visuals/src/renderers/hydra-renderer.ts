import Hydra from 'hydra-synth';
import { applyMode, MODES, type ModeName } from '../scenes';
import type { Renderer } from './types';

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
    // Hydra lacks a clean teardown API — hush clears outputs,
    // then we release the WebGL context for canvas reuse
    this.h?.hush();
    const gl = this.canvas?.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.h = null;
  }
}
