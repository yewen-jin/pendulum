import * as THREE from 'three';

export interface ThreeScene {
  readonly name: string;
  setup(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  tick(dt: number): void;
  resize(w: number, h: number, camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}
