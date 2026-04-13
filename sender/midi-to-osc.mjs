/**
 * midi-to-osc.mjs — Runs on the MUSIC machine (Mac mini).
 *
 * Reads MIDI from all connected controllers and forwards as OSC
 * to the visual machine's bridge (ROG) over UDP.
 *
 * Usage:
 *   cd sender && npm install && npm start
 *
 * Environment variables:
 *   BRIDGE_HOST  — visual machine IP (default: 127.0.0.1 for local testing)
 *   BRIDGE_PORT  — bridge OSC port (default: 9000)
 *   MIDI_DEVICE  — specific MIDI device name (default: all inputs)
 *
 * List available MIDI devices:
 *   npm run list
 */

import dgram from 'node:dgram';
import easymidi from 'easymidi';

const BRIDGE_HOST = process.env.BRIDGE_HOST ?? '127.0.0.1';
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT ?? 9000);
const MIDI_DEVICE = process.env.MIDI_DEVICE ?? null;

const sock = dgram.createSocket('udp4');

// ── OSC encoding (same helpers as test-osc.mjs) ────────────────────────────

function pad4(buf) {
  const rem = buf.length % 4;
  return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem)]);
}

function encodeStr(str) {
  return pad4(Buffer.from(str + '\0', 'utf8'));
}

function oscMsg(path, type, value) {
  const addr = encodeStr(path);
  if (type === null) return Buffer.concat([addr, encodeStr(',')]);
  const tag = encodeStr(',' + type);
  const arg = Buffer.alloc(4);
  if (type === 'f') arg.writeFloatBE(value, 0);
  else if (type === 'i') arg.writeInt32BE(value, 0);
  return Buffer.concat([addr, tag, arg]);
}

function send(path, type = null, value = null) {
  sock.send(oscMsg(path, type, value), BRIDGE_PORT, BRIDGE_HOST);
}

// ── MIDI handling ───────────────────────────────────────────────────────────

function attachInput(name) {
  const input = new easymidi.Input(name);
  console.log(`[midi] listening: ${name}`);

  input.on('cc', (msg) => {
    const val = msg.value / 127;
    send(`/midi/cc/${msg.controller}`, 'f', val);
  });

  input.on('noteon', (msg) => {
    if (msg.velocity > 0) {
      send('/midi/note', null);
      send('/midi/velocity', 'f', msg.velocity / 127);
      send('/midi/pitch', 'f', msg.note / 127);
    }
  });

  input.on('noteoff', () => {});

  return input;
}

// ── Boot ────────────────────────────────────────────────────────────────────

const inputs = easymidi.getInputs();
console.log(`[midi-to-osc] available devices: ${inputs.join(', ') || '(none)'}`);
console.log(`[midi-to-osc] sending to udp://${BRIDGE_HOST}:${BRIDGE_PORT}`);

if (inputs.length === 0) {
  console.error('[midi-to-osc] no MIDI inputs found. Plug in a controller and retry.');
  process.exit(1);
}

const handles = [];
if (MIDI_DEVICE) {
  if (!inputs.includes(MIDI_DEVICE)) {
    console.error(`[midi-to-osc] device "${MIDI_DEVICE}" not found. Available: ${inputs.join(', ')}`);
    process.exit(1);
  }
  handles.push(attachInput(MIDI_DEVICE));
} else {
  for (const name of inputs) handles.push(attachInput(name));
}

process.on('SIGINT', () => {
  handles.forEach(h => h.close());
  sock.close();
  process.exit(0);
});
