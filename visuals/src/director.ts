// Mode selection. Phone OSC drives scene changes; pose/audio drive the
// continuous parameters inside each scene (handled in scenes.ts).
//
// `/phone/mode` with an int arg (0..N-1) selects the mode.
// `/phone/panic` blacks out briefly regardless of current mode.

import { applyMode, MODES, type ModeName } from './scenes';
import { get, pulse } from './bus';

let hydra: any = null;
let current: ModeName = 'drift';

export function initDirector(h: any) {
  hydra = h;
  applyMode(hydra, current);
}

export function tick() {
  // Phone-selected mode
  const idx = Math.round(get('phone.mode', 0));
  const next = MODES[Math.max(0, Math.min(MODES.length - 1, idx))];
  if (next !== current) {
    current = next;
    applyMode(hydra, current);
    console.log('[director] mode ->', current);
  }

  // Panic: stamp black over everything for ~250ms via CSS overlay
  if (pulse('phone.panic') > 0.01) document.body.classList.add('panic');
  else document.body.classList.remove('panic');
}

export function currentMode(): ModeName { return current; }
