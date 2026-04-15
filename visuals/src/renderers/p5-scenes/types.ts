import type p5 from 'p5';

export interface P5Scene {
  readonly name: string;
  setup(p: p5): void;
  draw(p: p5, dt: number): void;
  resize(p: p5, w: number, h: number): void;
  dispose(): void;
}
