// Mode selection. Phone OSC drives scene changes; pose/audio drive the
// continuous parameters inside each scene (handled in scenes.ts).
//
// `/phone/mode` with an int arg (0..N-1) selects the mode.
// `/phone/panic` blacks out briefly regardless of current mode.

import { get, pulse } from './bus';
import { config } from './settings';
import type { Renderer } from './renderers/types';
import { registerDefaults, rendererForScene, SCENES } from './renderers/registry';

let canvas: HTMLCanvasElement | null = null;
let activeRenderer: Renderer | null = null;
let current: string = 'drift';

/** Replace the canvas DOM element to get a fresh WebGL context.
 *  The old canvas (with any orphaned raf-loops) detaches from the DOM. */
function freshCanvas(): HTMLCanvasElement {
  const old = canvas!;
  const next = document.createElement('canvas');
  next.id = old.id;
  const parent = old.parentNode;
  if (parent) {
    parent.replaceChild(next, old);
  } else {
    // Previous renderer detached the canvas — reattach to body.
    document.body.appendChild(next);
  }
  canvas = next;
  return next;
}

export async function initDirector(c: HTMLCanvasElement) {
  canvas = c;
  registerDefaults();

  const renderer = rendererForScene(current);
  if (renderer) {
    await renderer.init(canvas);
    activeRenderer = renderer;
    activeRenderer.applyScene(current);
  }
}

export function tick() {
  const next = config.sceneOverride
    ?? SCENES[Math.max(0, Math.min(SCENES.length - 1, Math.round(get('phone.mode', 0))))];
  if (next && next !== current) {
    const nextRenderer = rendererForScene(next);
    if (nextRenderer && nextRenderer !== activeRenderer) {
      // Cross-renderer switch: destroy old renderer, swap in a fresh
      // canvas so the new renderer gets a clean WebGL context
      activeRenderer?.destroy();
      activeRenderer = null;
      const c = freshCanvas();
      nextRenderer.init(c).then(() => {
        activeRenderer = nextRenderer;
        activeRenderer.applyScene(next);
      });
    } else if (activeRenderer) {
      activeRenderer.applyScene(next);
    }
    current = next;
    console.log('[director] mode ->', current);
  }

  activeRenderer?.tick();

  // Panic: stamp black over everything for ~250ms via CSS overlay
  if (pulse('phone.panic') > 0.01) document.body.classList.add('panic');
  else document.body.classList.remove('panic');
}

export function currentMode(): string { return current; }
