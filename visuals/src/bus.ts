// Unified signal bus. OSC messages from bridge + locally derived signals
// (audio, pose, face) land here as a flat dotted-key store with optional
// one-pole smoothing. Hydra scenes read via getters that always return
// up-to-date smoothed values, avoiding per-frame object churn.

type Signal = {
  raw: number;
  smoothed: number;
  alpha: number;  // smoothing factor (0 = no smoothing, 1 = frozen)
  lastT: number;
};

const state = new Map<string, Signal>();
const impulses = new Map<string, number>();  // key -> decaying 0..1
const IMPULSE_DECAY_MS = 250;

export function set(key: string, value: number, alpha = 0.8) {
  let s = state.get(key);
  const now = performance.now();
  if (!s) {
    s = { raw: value, smoothed: value, alpha, lastT: now };
    state.set(key, s);
    return;
  }
  s.raw = value;
  s.smoothed = s.smoothed * alpha + value * (1 - alpha);
  s.lastT = now;
}

export function trigger(key: string) {
  impulses.set(key, performance.now());
}

export function get(key: string, fallback = 0): number {
  const s = state.get(key);
  return s ? s.smoothed : fallback;
}

export function raw(key: string, fallback = 0): number {
  const s = state.get(key);
  return s ? s.raw : fallback;
}

export function pulse(key: string): number {
  // 1.0 at trigger, decays linearly over IMPULSE_DECAY_MS
  const t = impulses.get(key);
  if (t === undefined) return 0;
  const age = performance.now() - t;
  if (age >= IMPULSE_DECAY_MS) { impulses.delete(key); return 0; }
  return 1 - age / IMPULSE_DECAY_MS;
}

export function allKeys(): string[] {
  return [...state.keys()].sort();
}

export function snapshot(): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, s] of state) o[k] = s.smoothed;
  return o;
}

// ---- OSC address -> bus key mapping ----------------------------------------
// OSC paths look like "/ableton/cc/71" or "/phone/intensity".
// We strip the leading slash and swap '/' for '.' so Hydra code reads
// `get('ableton.cc.71')`.
function pathToKey(path: string): string {
  return path.replace(/^\//, '').replace(/\//g, '.');
}

export function ingestOsc(path: string, args: any[]) {
  const key = pathToKey(path);
  if (args.length === 0) { trigger(key); return; }
  const v = typeof args[0] === 'object' ? args[0].value : args[0];
  if (typeof v === 'number') set(key, v);
  else if (typeof v === 'boolean') set(key, v ? 1 : 0);
  // string-valued OSC (e.g. named scene) stored under a sibling key
  else if (typeof v === 'string') (state as any)._strings ??= new Map(),
    (state as any)._strings.set(key, v);
}

export function getString(key: string): string | undefined {
  return (state as any)._strings?.get(key);
}

// ---- WS client --------------------------------------------------------------
export function connectBridge(url: string) {
  let ws: WebSocket | null = null;
  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => console.log('[bus] bridge connected', url);
    ws.onclose = () => { console.warn('[bus] bridge closed, retrying'); setTimeout(open, 1000); };
    ws.onerror = () => ws?.close();
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        ingestOsc(m.path, m.args);
      } catch {}
    };
  };
  open();
}
