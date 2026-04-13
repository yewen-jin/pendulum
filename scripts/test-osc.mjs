/**
 * test-osc.mjs — Synthetic OSC sender for pendulum smoke tests.
 *
 * Sends a cycling set of OSC messages to the bridge so you can verify the
 * full signal → visual path without needing a phone or Ableton running.
 *
 * How to run:
 *   node scripts/test-osc.mjs
 *
 * Override target:
 *   HOST=192.168.1.x PORT=9000 node scripts/test-osc.mjs
 *
 * What to expect in the browser debug overlay (press 'd'):
 *   phone.intensity  — slow sine wave, 0 → 1 → 0 over ~10 s
 *   phone.mode       — steps 0 / 1 / 2 / 3, changes every ~8 s
 *                      (triggers scene switches in the visualiser)
 *   phone.panic      — occasional impulse every ~20 s (brief blackout)
 *   ableton.cc.71    — faster sine, 0 → 1 → 0 over ~4 s
 *
 * The OSC encoding below is hand-rolled for the tiny subset used here
 * (a single int or float arg, or no args). No external deps needed.
 */

import dgram from 'node:dgram';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 9000);

const sock = dgram.createSocket('udp4');

// ── OSC encoding helpers ────────────────────────────────────────────────────

/** Pad a Buffer to the next 4-byte boundary. */
function pad4(buf) {
  const rem = buf.length % 4;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(4 - rem)]);
}

/** Encode a null-terminated, 4-byte-padded OSC string. */
function encodeStr(str) {
  return pad4(Buffer.from(str + '\0', 'utf8'));
}

/**
 * Build a minimal OSC message buffer.
 * @param {string} path   - OSC address, e.g. '/phone/intensity'
 * @param {'f'|'i'|null} type - argument type, or null for no-arg impulse
 * @param {number|null} value
 */
function oscMsg(path, type, value) {
  const addrBuf = encodeStr(path);
  if (type === null) {
    // Argless message — type tag string is just ","
    return Buffer.concat([addrBuf, encodeStr(',')]);
  }
  const tagBuf = encodeStr(',' + type);
  const argBuf = Buffer.alloc(4);
  if (type === 'f') {
    argBuf.writeFloatBE(value, 0);
  } else if (type === 'i') {
    argBuf.writeInt32BE(value, 0);
  }
  return Buffer.concat([addrBuf, tagBuf, argBuf]);
}

function send(path, type = null, value = null) {
  const buf = oscMsg(path, type, value);
  sock.send(buf, PORT, HOST, (err) => {
    if (err) console.error('[osc] send error', err.message);
  });
}

// ── Timing state ────────────────────────────────────────────────────────────

const START = Date.now();
let lastMode = -1;
let lastPanic = -Infinity;

const MODE_INTERVAL_MS = 8000;   // step mode every 8 s
const PANIC_INTERVAL_MS = 20000; // impulse every 20 s
const TICK_MS = 50;              // 20 Hz update rate

// ── Main loop ───────────────────────────────────────────────────────────────

console.log(`[test-osc] sending to udp://${HOST}:${PORT}  (Ctrl-C to stop)`);
console.log('[test-osc] signals: phone.intensity (slow sine), phone.mode (steps), phone.panic (impulse ~20s), ableton.cc.71 (fast sine)');

setInterval(() => {
  const elapsed = Date.now() - START;
  const t = elapsed / 1000; // seconds

  // Slow sine 0..1, period ~10 s
  const intensitySine = (Math.sin((t / 10) * Math.PI * 2) + 1) / 2;
  send('/phone/intensity', 'f', intensitySine);

  // Faster sine 0..1, period ~4 s
  const cc71Sine = (Math.sin((t / 4) * Math.PI * 2) + 1) / 2;
  send('/ableton/cc/71', 'f', cc71Sine);

  // Step mode 0→1→2→3 every 8 s
  const mode = Math.floor((elapsed / MODE_INTERVAL_MS) % 4);
  if (mode !== lastMode) {
    send('/phone/mode', 'i', mode);
    lastMode = mode;
    console.log(`[test-osc] /phone/mode → ${mode}`);
  }

  // Panic impulse every ~20 s
  if (elapsed - lastPanic >= PANIC_INTERVAL_MS) {
    send('/phone/panic');
    lastPanic = elapsed;
    console.log('[test-osc] /phone/panic impulse');
  }
}, TICK_MS);
