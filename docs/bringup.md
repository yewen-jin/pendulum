# Pendulum — Bring-up Checklist

Step-by-step from cold machine to verified signal→visual reactivity. Work through each section in order; don't skip ahead.

---

## 1. Preflight — install deps

Open two terminal tabs on the ROG.

**Tab A — bridge:**
```sh
cd pendulum/bridge
npm install
```

Expected: `node_modules/` populated, no errors. The only deps are `osc` and `ws`.

**Tab B — visuals:**
```sh
cd pendulum/visuals
npm install
```

Expected: `node_modules/` populated including `hydra-synth`, `@mediapipe/tasks-vision`.

---

## 2. Start the bridge

In Tab A:
```sh
npm start
```

Expected log output (within 1–2 seconds):
```
[osc] listening on udp://0.0.0.0:9000
[ws]  listening on ws://0.0.0.0:9001
```

The bridge is now ready to receive OSC on UDP 9000 and relay it over WebSocket 9001.

---

## 3. Verify OSC path with test sender

Open a third terminal tab on the ROG.

```sh
node pendulum/scripts/test-osc.mjs
```

Expected console output (test-osc side):
```
[test-osc] sending to udp://127.0.0.1:9000  (Ctrl-C to stop)
[test-osc] signals: phone.intensity (slow sine) ...
[test-osc] /phone/mode → 0
```

Every ~8 seconds you should see `/phone/mode → 1`, `/phone/mode → 2`, etc.
Every ~20 seconds: `/phone/panic impulse`.

Bridge Tab A should remain silent (it doesn't log individual messages). That is expected — the bridge only logs connections and errors.

Leave this running while you work through the remaining steps.

---

## 4. Start the visuals dev server

In Tab B:
```sh
npm run dev
```

Expected:
```
  VITE v5.x.x  ready in XXX ms
  ➜  Local:   http://localhost:5173/
```

Open `http://localhost:5173` in Chrome or Edge (Firefox lacks some Web Audio constraints needed for line-in selection). Keep DevTools console open (`F12`).

---

## 5. First load — permissions and device selection

On first visit the page shows the **pendulum · setup** screen.

1. **Browser permission prompt** — the page requests mic + camera access to enumerate device labels. If the machine has no camera (e.g. Mac mini), it falls back to audio-only permission automatically. Click **Allow** on whatever prompt appears.

2. **Nord audio input** — select the audio input receiving the Nord's Y-split leg. On ROG this is typically `"Line In (Realtek..."`. On Mac mini for local testing, select the SSL2 or built-in input. Do not pick the built-in mic.

3. **Camera — performer 1** — select your webcam, or leave at `(none)`. Camera is optional — `audio.*`, `phone.*`, and `midi.*` signals still drive all scenes without it. Pose signals (`pose.motion`, `pose.openness`) remain at 0 when no camera is selected.

4. Click **start**. Selections are saved to `localStorage`; subsequent page loads skip this screen. To re-show the setup screen, clear `localStorage` in DevTools → Application → Local Storage → delete `pendulum.*` keys, then reload.

5. The Hydra canvas should immediately become active and the `drift` scene should appear — slow flowing noise with faint stars.

---

## 6. Debug overlay — verify signals are moving

Press **`d`** to toggle the signal-monitor overlay. You should see a green-on-black readout updating every 100 ms.

**With `test-osc.mjs` running:**

| Signal key          | Expected behaviour                                  |
| ------------------- | --------------------------------------------------- |
| `phone.intensity`   | Slowly oscillates 0 → 1 → 0 over ~10 s             |
| `phone.mode`        | Steps 0 / 1 / 2 / 3 every ~8 s                     |
| `ableton.cc.71`     | Faster oscillation 0 → 1 → 0 over ~4 s             |

**With a MIDI controller plugged in via USB:**

| Signal key          | Expected behaviour                                  |
| ------------------- | --------------------------------------------------- |
| `midi.cc.16`..`31`  | Responds to knob turns (0..1 range)                  |
| `midi.note`         | Brief impulse on each note-on                        |
| `midi.velocity`     | Jumps to velocity of last note played                |

Web MIDI reads the controller directly in the browser (single-machine setup). For two-machine setup, run the MIDI sender on the Mac mini instead — see step 6b below.

**With Nord plugged into line-in and playing:**

| Signal key          | Expected behaviour                                  |
| ------------------- | --------------------------------------------------- |
| `audio.rms`         | Responds to note volume; should reach 0.3–0.8 on loud notes |
| `audio.centroid`    | Shifts with timbre — higher for bright patches, lower for pads |
| `audio.onset`       | Brief impulse spike (0 → decay) on each new note attack |

If a signal key is not appearing in the overlay at all, it has never been written to the bus — see Troubleshooting below.

---

## 6b. Two-machine setup — MIDI sender on Mac mini

If testing the two-machine setup (MIDI controller on Mac mini, visuals on ROG):

```sh
# On Mac mini:
cd pendulum/sender && npm install
BRIDGE_HOST=<rog_ip> npm start
```

Expected output: lists available MIDI devices and confirms `sending to udp://<rog_ip>:9000`. Turn a knob — the ROG's debug overlay should show `midi.cc.<N>` values updating. This replaces Web MIDI; both paths write the same bus keys.

---

## 7. Expected visual reaction — `drift` scene

With audio and/or MIDI active you should observe:

- **Brightness / density** — noise grain brightens and thickens as `audio.rms` rises. Long sustained notes = full bright starfield. CC25 (brightness knob) also shifts this.
- **Color shift** — red channel increases with high `audio.centroid` (bright synth patches); blue channel increases with low centroid (pads/bass). CC17 (color knob) shifts the palette further.
- **Vertical scroll speed** — starfield drifts faster when `audio.rms` is high. CC19 (speed knob) adds additional scroll.
- **Kaleidoscope** — CC18 increases symmetry from 1 (none) up to 7 segments.
- **Rotation** — CC22 rotates the entire canvas.
- **Scale / zoom** — CC23 zooms in.
- **Modulation** — CC20 increases the voronoi warp depth.
- **Crosshair pop** — a faint green `shape(4)` cross pulses in sync with `audio.onset` (each note attack). Subtle — look for the brief green flash at note starts.
- **Global intensity** — `phone.intensity` from the test script scales the crosshair's mix level, so it will visibly dim and brighten over the 10-second sine cycle.
- **Scene switches** — every 8 s `phone.mode` steps → the scene switches: `drift` → `debris` → `signalLoss` → `reentry` → back to `drift`.
- **Panic** — every ~20 s the screen briefly blacks out for the duration of the `phone.panic` impulse decay (~250 ms).

---

## 8. Troubleshooting

### No audio signal (`audio.rms` stuck at 0 or absent from overlay)

1. **Wrong device selected** — go back to setup (clear `localStorage` in DevTools → Application → Local storage, then reload) and pick the correct line-in.
2. **Line-in level too low** — the ROG's line-in input gain may need boosting in Windows Sound settings. Right-click the speaker icon → Sound settings → Recording devices → Line In → Properties → Levels. The code already applies 4× software gain, but hardware level must be above noise floor.
3. **Mic permission denied** — if the browser shows a camera/mic blocked icon in the address bar, click it and allow, then reload.
4. **SSL2 phantom power / routing** — Nord should go into SSL2 input 1 or 2 as line level (not mic). Confirm SSL2's direct monitor knob is routing to your speakers but this doesn't affect the browser capture.

### No OSC signals (`phone.*` absent or frozen in overlay)

1. **Bridge not running** — check Tab A shows both `[osc]` and `[ws]` listening lines. If not, re-run `npm start`.
2. **`test-osc.mjs` died silently** — check Tab C. If you see no repeated output, it may have crashed; re-run it. Add `--trace-uncaught` if needed.
3. **Firewall blocking UDP 9000** — on Windows 10, Windows Defender Firewall may block the UDP port. Go to Control Panel → Windows Defender Firewall → Advanced Settings → Inbound Rules, add a rule for UDP port 9000. For the smoke test (loopback only) this usually is not needed, but matters when the Mac mini or phone sends from the network.
4. **WebSocket not connected** — check the browser console for `[bus] bridge connected ws://localhost:9001`. If absent or showing repeated `bridge closed, retrying`, the bridge WS server is not reachable (wrong port, or bridge crashed).

### No MIDI signals (`midi.cc.*` absent from overlay)

**Single-machine (Web MIDI):**
1. **Browser doesn't support Web MIDI** — Firefox has no Web MIDI API. Use Chrome or Edge.
2. **Permission denied** — some browsers require HTTPS or `localhost` for Web MIDI. Check the console for `[midi] Web MIDI not available`.
3. **Controller not detected** — check `[midi] found: <name>` in the console. If no devices listed, verify the controller is plugged in and recognized by the OS.

**Two-machine (MIDI sender):**
1. **Sender not running** — check Mac mini terminal shows `[midi] listening: <device>`.
2. **Wrong BRIDGE_HOST** — sender must point at the ROG's IP, not `127.0.0.1`.
3. **Firewall** — same as the OSC troubleshooting above (UDP 9000 must be open on ROG).
4. **No MIDI devices found** — run `npm run list` in the sender directory to check. Verify the controller is plugged into the Mac mini's USB.

### Hydra canvas black

1. Open browser DevTools console (`F12`). Look for errors referencing `regl`, `WebGL`, or `Hydra`.
2. Confirm the `<canvas id="stage">` element exists in the DOM (Elements tab).
3. Try a different Chromium-based browser. Firefox has inconsistent WebGL2 behavior on some ROG GPU configs.
4. If you see `WebGL: CONTEXT_LOST_WEBGL` — this is a GPU driver issue on Windows. Update GPU drivers or try disabling hardware acceleration in the browser.
