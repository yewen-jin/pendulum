// Toggle with 'd'. Shows every signal currently on the bus, grouped by category.
// Essential for tuning OSC ranges during rehearsal.

import { allKeys, get, raw } from './bus';
import { currentMode } from './director';

const el = () => document.getElementById('debug')!;

// Collapse state: maps category prefix -> boolean (true = collapsed)
const collapsed: Record<string, boolean> = {};

// Category config: order, label, color
const CATEGORIES: Array<{ prefix: string; label: string; color: string }> = [
  { prefix: 'audio', label: 'AUDIO',  color: '#0ff' },
  { prefix: 'pose',  label: 'POSE',   color: '#8f8' },
  { prefix: 'face',  label: 'FACE',   color: '#ff0' },
  { prefix: 'midi',  label: 'MIDI',   color: '#f0f' },
  { prefix: 'phone', label: 'PHONE',  color: '#fa0' },
];

export function installDebug() {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'd') {
      document.body.classList.toggle('debug');
      if (document.body.classList.contains('debug')) renderNow();
    }
    if (e.key === 'f') document.documentElement.requestFullscreen?.();
  });

  // Event delegation: clicks on section headers toggle collapse
  el().addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const prefix = target.dataset.prefix;
    if (prefix !== undefined) {
      collapsed[prefix] = !collapsed[prefix];
      renderNow();
    }
  });

  setInterval(render, 100);
}

function bar(v: number, w = 16): string {
  const n = Math.round(Math.max(0, Math.min(1, v)) * w);
  return '█'.repeat(n) + '·'.repeat(w - n);
}

function renderNow() {
  // Bypass the visibility check for immediate paint on toggle/click
  _render();
}

function render() {
  if (!document.body.classList.contains('debug')) return;
  _render();
}

function _render() {
  const keys = allKeys();

  // Bucket keys by category prefix
  const buckets: Record<string, string[]> = {};
  const knownPrefixes = new Set(CATEGORIES.map(c => c.prefix));

  for (const k of keys) {
    const prefix = k.split('.')[0];
    if (!buckets[prefix]) buckets[prefix] = [];
    buckets[prefix].push(k);
  }

  // Build HTML
  const parts: string[] = [];

  // Mode line — always visible, outside any section
  parts.push(`<span style="color:#8f8">mode: ${currentMode()}</span>`);

  // Render known categories in fixed order, then any unknown ones
  const renderedPrefixes = new Set<string>();

  const allCats = [
    ...CATEGORIES,
    // Append any unknown prefixes as fallback "other" category
    ...Object.keys(buckets)
      .filter(p => !knownPrefixes.has(p))
      .map(p => ({ prefix: p, label: p.toUpperCase(), color: '#8f8' })),
  ];

  for (const cat of allCats) {
    const { prefix, label, color } = cat;
    const catKeys = buckets[prefix];
    if (!catKeys || catKeys.length === 0) continue;
    renderedPrefixes.add(prefix);

    const isCollapsed = !!collapsed[prefix];
    const chevron = isCollapsed ? '▶' : '▼';

    // Section header — clickable via data-prefix
    parts.push(
      `<span class="dbg-header" data-prefix="${prefix}" style="color:${color};cursor:pointer;user-select:none">${chevron} ${label} (${catKeys.length})</span>`
    );

    if (!isCollapsed) {
      for (const k of catKeys) {
        const v = get(k);
        const r = raw(k);
        const shortKey = k.padEnd(22);
        parts.push(
          `  <span style="color:#6a6">${shortKey}</span> <span style="color:${color}">${bar(v)}</span> <span style="color:#ccc">${v.toFixed(2)}</span> <span style="color:#555">(${r.toFixed(2)})</span>`
        );
      }
    }

    parts.push(''); // blank line between sections
  }

  el().innerHTML = parts.join('\n');
}
