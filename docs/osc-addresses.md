# OSC address table

All OSC arrives at the bridge on **UDP 9000**. The bridge forwards every message as JSON over **WS 9001** to the browser, where `bus.ingestOsc()` converts `/a/b/c` → bus key `a.b.c`. Scenes read via `get('a.b.c')`.

Numeric args are smoothed (one-pole, α=0.8 default). Argless messages are treated as impulses and read via `pulse(key)`.

## From Ableton (M1 Mac mini via AbletonOSC)

Install: <https://github.com/ideoforms/AbletonOSC>. Default port is 11000 — change to **9000** and point to the visual machine's IP (router-assigned static).

AbletonOSC emits e.g. `/live/song/get/beats_per_bar`, `/live/track/get/volume`, `/live/clip/get/playing_status_changed`. Map the ones you care about in a small Max for Live device or AbletonOSC config, re-emitting as:

| OSC path                      | Type   | Meaning                          |
| ----------------------------- | ------ | -------------------------------- |
| `/ableton/beat`               | float  | current beat (0..beats_per_bar)  |
| `/ableton/tempo`              | float  | BPM                              |
| `/ableton/track/<n>/level`    | float 0..1 | post-fader meter             |
| `/ableton/cc/<n>`             | float 0..1 | any MIDI CC you want exposed |
| `/ableton/note`               | (none) | impulse on any MIDI note         |
| `/ableton/glitch`             | float 0..1 | free macro → visual glitch   |

## From MobMuPlat (phone)

Point MobMuPlat's OSC output at **`visual_machine_ip:9000`**.

| OSC path           | Type       | Meaning                              |
| ------------------ | ---------- | ------------------------------------ |
| `/phone/mode`      | int 0..3   | scene: 0 drift, 1 debris, 2 signalLoss, 3 reentry |
| `/phone/intensity` | float 0..1 | global intensity multiplier          |
| `/phone/x`         | float 0..1 | XY pad horizontal                    |
| `/phone/y`         | float 0..1 | XY pad vertical                      |
| `/phone/panic`     | (none)     | impulse — blackout                   |

## Derived (set in-browser, not OSC)

| Bus key             | Source          | Notes                            |
| ------------------- | --------------- | -------------------------------- |
| `audio.rms`         | Nord line-in    | 0..1, gain-boosted                |
| `audio.centroid`    | Nord line-in    | 200–6000 Hz → 0..1                |
| `audio.onset`       | Nord line-in    | impulse                          |
| `pose.motion`       | MediaPipe       | mean landmark displacement, 0..1 |
| `pose.openness`     | MediaPipe       | wrist distance, 0..1             |
| `pose.p1.*`         | MediaPipe       | per-performer signals            |
