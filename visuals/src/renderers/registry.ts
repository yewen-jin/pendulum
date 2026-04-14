import type { Renderer } from './types';
import { HydraRenderer } from './hydra-renderer';

const renderers: Renderer[] = [];
const sceneMap = new Map<string, Renderer>();

/** Flat list of all scene names across all registered renderers. */
export const SCENES: string[] = [];

export function registerRenderer(r: Renderer): void {
  renderers.push(r);
  for (const scene of r.scenes) {
    sceneMap.set(scene, r);
  }
}

export function rendererForScene(scene: string): Renderer | undefined {
  return sceneMap.get(scene);
}

export function registerDefaults(): void {
  registerRenderer(new HydraRenderer());
  SCENES.length = 0;
  SCENES.push(...renderers.flatMap(r => r.scenes));
}
