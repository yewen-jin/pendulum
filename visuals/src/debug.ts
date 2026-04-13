// Toggle with 'd'. Shows every signal currently on the bus.
// Essential for tuning OSC ranges during rehearsal.

import { allKeys, get, raw } from './bus';
import { currentMode } from './director';

const el = () => document.getElementById('debug')!;

export function installDebug() {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'd') document.body.classList.toggle('debug');
    if (e.key === 'f') document.documentElement.requestFullscreen?.();
  });
  setInterval(render, 100);
}

function bar(v: number, w = 16): string {
  const n = Math.round(Math.max(0, Math.min(1, v)) * w);
  return '█'.repeat(n) + '·'.repeat(w - n);
}

function render() {
  if (!document.body.classList.contains('debug')) return;
  const lines = [`mode: ${currentMode()}`, ''];
  for (const k of allKeys()) {
    const v = get(k), r = raw(k);
    lines.push(`${k.padEnd(22)} ${bar(v)} ${v.toFixed(2)} (raw ${r.toFixed(2)})`);
  }
  el().textContent = lines.join('\n');
}
