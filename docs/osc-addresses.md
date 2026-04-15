# OSC address table

All OSC arrives at the bridge on **UDP 9000**. The bridge forwards every message as JSON over **WS 9001** to the browser, where `bus.ingestOsc()` converts `/a/b/c` → bus key `a.b.c`. Scenes read via `get('a.b.c')`.

Numeric args are smoothed (one-pole, α=0.8 default). Argless messages are treated as impulses and read via `pulse(key)`.

## From MIDI sender (Mac mini → ROG)

The primary working control path. `sender/midi-to-osc.mjs` runs on the Mac mini, reads the MIDI controller via USB (easymidi), and sends OSC to the bridge. See `docs/abletonosc.md` for setup.

| OSC path           | Type       | Bus key          | Meaning                        |
| ------------------ | ---------- | ---------------- | ------------------------------ |
| `/midi/cc/<N>`     | float 0..1 | `midi.cc.<N>`    | CC value (N = controller num)  |
| `/midi/note`       | (none)     | `midi.note`      | impulse on note-on             |
| `/midi/velocity`   | float 0..1 | `midi.velocity`  | last note-on velocity          |
| `/midi/pitch`      | float 0..1 | `midi.pitch`     | last note-on pitch (note/127)  |

Controller mapping (Channel 2, CC 16–31): cc16=density, cc17=color, cc18=kaleid, cc19=speed, cc20=modulation, cc21=feedback, cc22=rotation, cc23=zoom, cc24=glitch, cc25=brightness, cc26=pixelate, cc27=hue, cc28–31=spare.

## From Ableton (future — not yet functional)

AbletonOSC (<https://github.com/ideoforms/AbletonOSC>) is installed but not wired. It uses a **request-response** model, not continuous broadcast — a subscription client needs to be written. Low priority since the MIDI sender covers the main control path. See `docs/abletonosc.md` for details.

Planned paths (if/when AbletonOSC is wired):

| OSC path                      | Type   | Meaning                          |
| ----------------------------- | ------ | -------------------------------- |
| `/ableton/beat`               | float  | current beat (0..beats_per_bar)  |
| `/ableton/tempo`              | float  | BPM                              |
| `/ableton/track/<n>/level`    | float 0..1 | post-fader meter             |

## From MobMuPlat (phone)

Point MobMuPlat's OSC output at **`visual_machine_ip:9000`**. Layout file: `phone/pendulum.mmp`. See `phone/README.md` for setup.

| OSC path           | Type       | Widget           | Meaning                              |
| ------------------ | ---------- | ---------------- | ------------------------------------ |
| `/phone/mode`      | int 0..3   | Menu (4 segs)    | scene: 0 drift, 1 debris, 2 signalLoss, 3 reentry |
| `/phone/intensity` | float 0..1 | Slider (vertical)| global intensity multiplier, default 0.6 |
| `/phone/x`         | float 0..1 | XYSlider         | XY pad horizontal (address base `/phone`) |
| `/phone/y`         | float 0..1 | XYSlider         | XY pad vertical (address base `/phone`) |
| `/phone/panic`     | (none)     | Button (momentary)| impulse — blackout ~250 ms          |

Note: the XYSlider widget is configured with base address `/phone`; MobMuPlat appends `/x` and `/y` to send two separate OSC messages per touch.

## Derived in-browser (not OSC)

These bus keys are set by in-browser modules, not received via OSC.

| Bus key                | Source          | Notes                              |
| ---------------------- | --------------- | ---------------------------------- |
| `audio.rms`            | Web Audio       | Nord line-in, 0..1, gain-boosted 4× |
| `audio.centroid`       | Web Audio       | 200–6000 Hz → 0..1                  |
| `audio.onset`          | Web Audio       | impulse on note attack               |
| `pose.motion`          | MediaPipe       | aggregate mean landmark displacement, 0..1 |
| `pose.openness`        | MediaPipe       | aggregate wrist distance, 0..1       |
| `pose.p1.motion`       | MediaPipe       | per-performer motion                 |
| `pose.p1.openness`     | MediaPipe       | per-performer openness               |
| `pose.p1.cx`           | MediaPipe       | per-performer body centroid X        |
| `midi.cc.<N>`          | Web MIDI        | single-machine fallback (same keys as sender) |
| `midi.note`            | Web MIDI        | impulse on note-on                   |
| `midi.velocity`        | Web MIDI        | last note-on velocity, 0..1          |
| `midi.pitch`           | Web MIDI        | last note-on pitch (note/127)        |
| `face.mouthOpen`       | MediaPipe Face  | aggregate jaw open, 0..1             |
| `face.browUp`          | MediaPipe Face  | aggregate inner brow raise, 0..1     |
| `face.eyeSquint`       | MediaPipe Face  | aggregate eye squint (L+R avg), 0..1 |
| `face.smile`           | MediaPipe Face  | aggregate mouth smile (L+R avg), 0..1 |
| `face.browDown`        | MediaPipe Face  | aggregate brow furrow (L+R avg), 0..1 |
| `face.p1.mouthOpen`    | MediaPipe Face  | per-performer jaw open               |
| `face.p1.browUp`       | MediaPipe Face  | per-performer inner brow raise       |
| `face.p1.eyeSquint`    | MediaPipe Face  | per-performer eye squint (L+R avg)   |
| `face.p1.smile`        | MediaPipe Face  | per-performer mouth smile (L+R avg)  |
| `face.p1.browDown`     | MediaPipe Face  | per-performer brow furrow (L+R avg)  |
| `face.yaw`             | MediaPipe Face  | aggregate head yaw, -1..1 (±45°)     |
| `face.pitch`           | MediaPipe Face  | aggregate head pitch, -1..1 (±45°)   |
| `face.roll`            | MediaPipe Face  | aggregate head roll, -1..1 (±45°)    |
| `face.p1.yaw`          | MediaPipe Face  | per-performer head yaw, -1..1        |
| `face.p1.pitch`        | MediaPipe Face  | per-performer head pitch, -1..1      |
| `face.p1.roll`         | MediaPipe Face  | per-performer head roll, -1..1       |

Web MIDI writes the same bus keys as the MIDI→OSC sender. In the two-machine setup, the sender's OSC messages arrive via bridge and take precedence. In single-machine mode, Web MIDI reads the controller directly.
