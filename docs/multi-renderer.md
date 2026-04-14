# Multi-renderer architecture

Support Three.js, p5.js, and other renderers alongside Hydra. Each mode/scene declares which renderer it uses. The bus remains renderer-agnostic.

## Design: renderer-per-mode

Each mode declares a renderer type. Director switches renderers on mode change. One renderer active at a time — simplest path for GPU contention (MediaPipe + audio analysis already compete for GPU).

```
mode "drift"     → hydra renderer
mode "debris"    → hydra renderer  
mode "warp"      → three renderer
mode "particles" → p5 renderer
```

### Why not multi-layer composition?

Running multiple WebGL contexts simultaneously (Hydra + Three.js) on the ROG's GPU alongside MediaPipe WASM+GPU is risky for frame drops. Renderer-per-mode is reliable and debuggable. Can upgrade to layered composition later if GPU headroom allows.

## Renderer interface

```typescript
// visuals/src/renderers/types.ts

export interface Renderer {
  /** Human-readable name for debug overlay */
  readonly name: string;
  
  /** Initialize renderer on the given canvas. Called once. */
  init(canvas: HTMLCanvasElement): Promise<void>;
  
  /** Apply a named scene. Equivalent to current applyMode() for Hydra. */
  applyScene(scene: string): void;
  
  /** Per-frame update. Read from bus via get()/pulse(). */
  tick(): void;
  
  /** Clean up WebGL context, animation loops, etc. */
  destroy(): void;
  
  /** List of scene names this renderer supports. */
  readonly scenes: string[];
}
```

## Canvas strategy

Single `<canvas id="stage">`. When switching between renderers that use different contexts (WebGL for Three.js vs Hydra's own WebGL), destroy the old context and reinitialize. This avoids the "max WebGL contexts" browser limit.

Exception: if switching between two scenes on the **same** renderer, just call `applyScene()` without destroy/init.

```
mode switch:
  if (newRenderer !== currentRenderer) {
    currentRenderer.destroy()
    newRenderer.init(canvas)
  }
  newRenderer.applyScene(sceneName)
```

## Renderer implementations

### HydraRenderer (wraps existing code)

```typescript
// visuals/src/renderers/hydra-renderer.ts
import Hydra from 'hydra-synth';

class HydraRenderer implements Renderer {
  name = 'hydra';
  scenes = ['drift', 'debris', 'signalLoss', 'reentry'];
  private h: any;
  
  async init(canvas) {
    this.h = new Hydra({ canvas, detectAudio: false, makeGlobal: true });
  }
  
  applyScene(scene) {
    // Delegates to existing applyMode() logic from scenes.ts
    applyHydraScene(this.h, scene);
  }
  
  tick() {
    // Hydra runs its own rAF internally — nothing to do here
  }
  
  destroy() {
    // Hydra cleanup: stop rAF, release WebGL context
    this.h?.synth?.stop?.();
  }
}
```

### ThreeRenderer

```typescript
// visuals/src/renderers/three-renderer.ts
import * as THREE from 'three';

class ThreeRenderer implements Renderer {
  name = 'three';
  scenes = ['warp', 'tunnel', 'grid'];  // example names
  private renderer: THREE.WebGLRenderer;
  private activeScene: ThreeScene;
  
  async init(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setSize(1920, 1080);
  }
  
  applyScene(scene) {
    this.activeScene?.cleanup();
    this.activeScene = THREE_SCENES[scene]();
  }
  
  tick() {
    // Read bus values, update scene uniforms/positions, render
    this.activeScene?.update();
    this.renderer.render(this.activeScene.scene, this.activeScene.camera);
  }
  
  destroy() {
    this.activeScene?.cleanup();
    this.renderer.dispose();
  }
}
```

### P5Renderer

```typescript
// visuals/src/renderers/p5-renderer.ts
import p5 from 'p5';

class P5Renderer implements Renderer {
  name = 'p5';
  scenes = ['particles', 'flow'];  // example names
  private sketch: p5;
  
  async init(canvas) {
    // p5 instance mode, attached to parent of canvas
    // Note: p5 creates its own canvas — may need to composite
    // onto #stage via drawImage or use p5's WEBGL mode on existing canvas
  }
  
  // ...
}
```

## Director changes

```typescript
// visuals/src/director.ts (updated)

import { RendererRegistry } from './renderers/registry';

const registry = new RendererRegistry();
let currentRenderer: Renderer | null = null;
let currentScene: string = 'drift';

function initDirector(canvas: HTMLCanvasElement) {
  registry.register(new HydraRenderer());
  registry.register(new ThreeRenderer());
  // Don't init any renderer yet — wait for first mode selection
}

function tick() {
  const nextScene = resolveScene(); // from phone.mode / config.sceneOverride
  
  if (nextScene !== currentScene) {
    const nextRenderer = registry.findRendererFor(nextScene);
    
    if (nextRenderer !== currentRenderer) {
      currentRenderer?.destroy();
      nextRenderer.init(canvas);
      currentRenderer = nextRenderer;
    }
    
    currentRenderer.applyScene(nextScene);
    currentScene = nextScene;
  }
  
  currentRenderer?.tick();
}
```

## Scene registry

Flat list. Each entry maps a scene name to a renderer + scene function.

```typescript
// visuals/src/renderers/registry.ts

type SceneEntry = {
  name: string;
  renderer: string;  // 'hydra' | 'three' | 'p5'
  label: string;     // for UI dropdown
};

const SCENE_LIST: SceneEntry[] = [
  { name: 'drift',      renderer: 'hydra', label: 'Drift (Hydra)' },
  { name: 'debris',     renderer: 'hydra', label: 'Debris (Hydra)' },
  { name: 'signalLoss', renderer: 'hydra', label: 'Signal Loss (Hydra)' },
  { name: 'reentry',    renderer: 'hydra', label: 'Reentry (Hydra)' },
  { name: 'warp',       renderer: 'three', label: 'Warp (Three.js)' },
  // ... add as you go
];
```

## Mode selection changes

Currently mode is an integer 0..3 from `/phone/mode`. With multi-renderer, options:

**Option A: Keep integer, expand range.** Mode 0–3 = Hydra scenes, 4+ = Three.js scenes. Simple, works with MobMuPlat slider.

**Option B: Named modes via OSC string.** `/phone/scene "warp"`. More flexible but requires MobMuPlat PD patch changes.

**Recommendation:** Option A for now. Keep the integer mapping, just grow the list. Update MobMuPlat slider range when scenes are added.

## Migration path

1. **Phase 1: Renderer interface + HydraRenderer wrapper.** Refactor existing code to use the `Renderer` interface. No new renderers yet. Everything still works exactly as before. *This is the critical step — get it right before adding complexity.*

2. **Phase 2: ThreeRenderer + one test scene.** Add Three.js, create one scene (e.g., particle field that reacts to `audio.rms`). Verify renderer switching works.

3. **Phase 3: Scene library expansion.** Add more Three.js/p5 scenes as needed. Each scene is a self-contained function.

## File structure

```
visuals/src/
  renderers/
    types.ts          # Renderer interface
    registry.ts       # Scene list + renderer lookup
    hydra-renderer.ts # Wraps existing Hydra + scenes.ts
    three-renderer.ts # Three.js scenes
    p5-renderer.ts    # p5.js scenes (when ready)
  scenes/
    hydra/            # Moved from scenes.ts, one file per scene
      drift.ts
      debris.ts
      signalLoss.ts
      reentry.ts
    three/
      warp.ts
      ...
  director.ts         # Updated to use registry
  bus.ts              # Unchanged
  ...
```

## Open questions

- [ ] Should renderer switching be instant or cross-fade (black gap between renderers)?
- [ ] GPU budget: how many WebGL contexts can the ROG handle alongside MediaPipe?
- [ ] p5.js canvas management — p5 wants to create its own canvas. Use instance mode with WEBGL on the shared canvas, or composite?
- [ ] Should scenes be hot-reloadable during rehearsal (Vite HMR per scene file)?
