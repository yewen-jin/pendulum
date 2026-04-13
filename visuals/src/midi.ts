// Web MIDI: reads all connected MIDI controllers directly in the browser.
// No M4L, no OSC, no bridge needed for MIDI signals.

import { set, trigger } from './bus';

export async function startMidi() {
  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess();
  } catch (e) {
    console.warn('[midi] Web MIDI not available', e);
    return;
  }

  for (const input of access.inputs.values()) {
    console.log(`[midi] found: ${input.name}`);
    input.onmidimessage = handleMessage;
  }

  access.onstatechange = (e) => {
    const port = (e as any).port as MIDIPort;
    if (port.type === 'input' && port.state === 'connected') {
      (port as MIDIInput).onmidimessage = handleMessage;
      console.log(`[midi] connected: ${port.name}`);
    }
  };
}

function handleMessage(e: MIDIMessageEvent) {
  if (!e.data || e.data.length < 3) return;
  const [status, data1, data2] = e.data;
  const type = status & 0xf0;

  if (type === 0xb0) {
    set(`midi.cc.${data1}`, data2 / 127);
  } else if (type === 0x90 && data2 > 0) {
    trigger('midi.note');
    set('midi.velocity', data2 / 127);
    set('midi.pitch', data1 / 127);
  }
}
