import * as THREE from 'three';
import type { Renderer } from '../types';
import type { ThreeScene } from './types';
import { ParticleDebrisScene } from './particle-debris';

export class ThreeRenderer implements Renderer {
  readonly name = 'three';
  readonly scenes: string[];

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private activeScene: ThreeScene | null = null;
  private sceneMap: Map<string, ThreeScene>;
  private resizeHandler: (() => void) | null = null;
  private clock = new THREE.Clock(false);

  constructor() {
    const scenes = [new ParticleDebrisScene()];
    this.sceneMap = new Map(scenes.map(s => [s.name, s]));
    this.scenes = scenes.map(s => s.name);
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    // Reset canvas dimensions to force context release on reuse
    canvas.width = canvas.width;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      65, window.innerWidth / window.innerHeight, 0.1, 200
    );

    this.resizeHandler = () => this.handleResize();
    window.addEventListener('resize', this.resizeHandler);

    this.clock.start();
  }

  applyScene(sceneName: string): void {
    if (!this.scene || !this.camera) return;

    this.activeScene?.dispose();
    // Clear the Three.js scene graph
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    this.scene.fog = null;

    const next = this.sceneMap.get(sceneName);
    if (next) {
      next.setup(this.scene, this.camera);
      this.activeScene = next;
    }
  }

  tick(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    const dt = this.clock.getDelta();
    this.activeScene?.tick(dt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    this.activeScene?.dispose();
    this.activeScene = null;
    this.clock.stop();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    // Release WebGL context for canvas reuse
    const gl = this.renderer?.getContext();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer?.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.camera) {
      this.activeScene?.resize(w, h, this.camera);
    }
  }
}
