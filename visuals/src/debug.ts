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

// Prefixes that get performer sub-grouping (p1/p2/aggregate)
const PERFORMER_GROUPED = new Set(['pose', 'face']);

// Detect performer tag from a key like "pose.p1.motion" or "face.p2.browUp"
// Returns 'p1', 'p2', or null (aggregate)
function performerTag(key: string): string | null {
  const parts = key.split('.');
  if (parts.length >= 2 && (parts[1] === 'p1' || parts[1] === 'p2')) return parts[1];
  // pose.state.p1.compact — tag is at index 2
  if (parts.length >= 3 && (parts[2] === 'p1' || parts[2] === 'p2')) return parts[2];
  return null;
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

  const allCats = [
    ...CATEGORIES,
    ...Object.keys(buckets)
      .filter(p => !knownPrefixes.has(p))
      .map(p => ({ prefix: p, label: p.toUpperCase(), color: '#8f8' })),
  ];

  for (const cat of allCats) {
    const { prefix, label, color } = cat;
    const catKeys = buckets[prefix];
    if (!catKeys || catKeys.length === 0) continue;

    const isCollapsed = !!collapsed[prefix];
    const chevron = isCollapsed ? '▶' : '▼';

    parts.push(
      `<span class="dbg-header" data-prefix="${prefix}" style="color:${color};cursor:pointer;user-select:none">${chevron} ${label} (${catKeys.length})</span>`
    );

    if (!isCollapsed) {
      if (PERFORMER_GROUPED.has(prefix)) {
        // Sub-group by performer: aggregate first, then p1, then p2
        const agg: string[] = [];
        const p1: string[] = [];
        const p2: string[] = [];
        for (const k of catKeys) {
          const tag = performerTag(k);
          if (tag === 'p1') p1.push(k);
          else if (tag === 'p2') p2.push(k);
          else agg.push(k);
        }
        const subGroups: [string, string[], string][] = [
          ['aggregate', agg, '#888'],
          ['p1', p1, '#8f8'],
          ['p2', p2, '#8cf'],
        ];
        for (const [subLabel, subKeys, subColor] of subGroups) {
          if (subKeys.length === 0) continue;
          parts.push(`  <span style="color:${subColor};font-size:10px">── ${subLabel} ──</span>`);
          for (const k of subKeys) {
            renderSignalLine(parts, k, color);
          }
        }
      } else {
        for (const k of catKeys) {
          renderSignalLine(parts, k, color);
        }
      }
    }

    parts.push('');
  }

  el().innerHTML = parts.join('\n');
}

function renderSignalLine(parts: string[], k: string, color: string) {
  const v = get(k);
  const r = raw(k);
  const shortKey = k.padEnd(28);
  parts.push(
    `  <span style="color:#6a6">${shortKey}</span> <span style="color:${color}">${bar(v)}</span> <span style="color:#ccc">${v.toFixed(2)}</span> <span style="color:#555">(${r.toFixed(2)})</span>`
  );
}
