import p5 from 'p5';
import type { Renderer } from '../types';
import type { P5Scene } from './types';
import { BodyLinesScene } from './body-lines';

export class P5Renderer implements Renderer {
  readonly name = 'p5';
  readonly scenes: string[];

  private sketch: p5 | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private activeScene: P5Scene | null = null;
  private sceneMap: Map<string, P5Scene>;
  private lastFrame = 0;

  constructor() {
    const scenes = [new BodyLinesScene()];
    this.sceneMap = new Map(scenes.map(s => [s.name, s]));
    this.scenes = scenes.map(s => s.name);
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    const self = this;

    return new Promise<void>((resolve) => {
      self.sketch = new p5((p: p5) => {
        p.setup = () => {
          p.createCanvas(window.innerWidth, window.innerHeight, p.P2D, canvas);
          p.colorMode(p.HSB, 360, 100, 100, 100);
          p.background(0);
          self.lastFrame = performance.now();

          // Disable p5's built-in loop — we tick from the director's rAF
          p.noLoop();
          resolve();
        };
      });
    });
  }

  applyScene(sceneName: string): void {
    if (!this.sketch) return;
    this.activeScene?.dispose();
    const next = this.sceneMap.get(sceneName);
    if (next) {
      next.setup(this.sketch);
      this.activeScene = next;
    }
  }

  tick(): void {
    if (!this.sketch || !this.activeScene) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    this.activeScene.draw(this.sketch, dt);
  }

  destroy(): void {
    this.activeScene?.dispose();
    this.activeScene = null;
    // Don't call sketch.remove() — it detaches the canvas from the DOM
    // before the director's freshCanvas() can replace it. The director
    // replaces the canvas element on cross-renderer switch, which
    // orphans p5's sketch state for GC. Just drop our references.
    this.sketch = null;
    this.canvas = null;
  }
}
