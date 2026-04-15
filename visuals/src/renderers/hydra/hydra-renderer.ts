import Hydra from 'hydra-synth';
import type { Renderer } from '../types';
import type { HydraScene } from './types';
import { DriftScene } from './drift';
import { DebrisScene } from './debris';
import { SignalLossScene } from './signal-loss';
import { ReentryScene } from './reentry';

export class HydraRenderer implements Renderer {
  readonly name = 'hydra';
  readonly scenes: string[];

  private h: any = null;
  private canvas: HTMLCanvasElement | null = null;
  private sceneMap: Map<string, HydraScene>;

  constructor() {
    const scenes: HydraScene[] = [
      new DriftScene(),
      new DebrisScene(),
      new SignalLossScene(),
      new ReentryScene(),
    ];
    this.sceneMap = new Map(scenes.map(s => [s.name, s]));
    this.scenes = scenes.map(s => s.name);
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    canvas.width = 1920;
    canvas.height = 1080;
    this.h = new Hydra({ canvas, detectAudio: false, makeGlobal: true });
  }

  applyScene(scene: string): void {
    this.sceneMap.get(scene)?.setup(this.h);
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
