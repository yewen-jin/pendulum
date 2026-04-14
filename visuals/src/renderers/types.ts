export interface Renderer {
  readonly name: string;
  readonly scenes: string[];
  init(canvas: HTMLCanvasElement): Promise<void>;
  applyScene(scene: string): void;
  tick(): void;
  destroy(): void;
}
