# pendulum

Live visualiser for a two-person experimental music performance. Pure-improv set — no scripted timeline. Visuals run autonomously, reacting to performer input via MIDI, audio analysis, and pose tracking. Aesthetic: post-apocalyptic, spaceship, post-war, on escape.

## Two-machine setup

```
Mac mini (M1)                          ROG G533Z (Windows 10)
├─ Ableton + Nord Rock 2              ├─ bridge (Node, UDP 9000 → WS 9001)
├─ MIDI controller (USB)              ├─ visuals (browser, Hydra + MediaPipe)
└─ sender/midi-to-osc.mjs ──OSC───┐   ├─ OBS recording
                                   ├─► Web Audio (Nord line-in)
MobMuPlat (phone) ────OSC──────────┘   └─ Webcam(s) for pose/face
                                   
Both machines + phone on dedicated travel router (ROG has static IP)
Nord Y-split: one leg to SSL2 (Ableton), one to ROG line-in (direct)
```

## Quick start

```sh
# ROG — two terminal tabs

# Terminal 1: start bridge
cd bridge && npm install && npm start
# Expected: OSC listening on UDP 9000, WS on 9001

# Terminal 2: start visuals dev server
cd visuals && npm install && npm run dev
# Open http://localhost:5173 in browser
```

First load prompts for audio input (Nord line-in) and camera selection. Selections persist in localStorage.

### Mac mini (two-machine setup)

```sh
cd sender && npm install
cp .env.example .env
# Edit .env with ROG's static IP and bridge port (default 127.0.0.1:9000)
npm start
# Reads MIDI controller, sends OSC to ROG bridge
```

### Test without hardware

```sh
cd scripts && node test-osc.mjs
# Synthetic signals (phase/intensity/mode/panic) to verify bridge → browser path
```

## Hotkeys

| Key | Effect |
|-----|--------|
| `f` | Toggle fullscreen |
| `d` | Debug signal overlay (all bus values, essential for tuning) |
| `m` | MediaPipe skeleton overlay (green pose + cyan face landmarks) |
| `s` | Rehearsal tuning panel (scene override, audio gain, smoothing, impulse decay) |

## Input sources

### Audio (Nord via line-in)

Web Audio analysis feeds three signals:
- `audio.rms` — signal level (0–1, gain-boosted 4×)
- `audio.centroid` — spectral brightness (200–6000 Hz → 0–1)
- `audio.onset` — impulse on note attack (fast/slow envelope ratio)

### MIDI controller (Channel 2, CC 16–31)

Reads via Web MIDI (single-machine) or MIDI→OSC sender (two-machine). Same bus keys either way.

| CC | Parameter | Effect |
|----|-----------|--------|
| 16 | density | Noise grain, voronoi count, static density |
| 17 | color | RGB channel balance |
| 18 | kaleid | Symmetry segments |
| 19 | speed | Scroll rate, animation tempo |
| 20 | modulation | Voronoi/noise warp depth |
| 21 | feedback | Modulation smear |
| 22 | rotation | Canvas rotation + speed |
| 23 | zoom | Global scale |
| 24 | glitch | Noise/distortion intensity |
| 25 | brightness | Luma / threshold |
| 26 | pixelate | Pixelation resolution |
| 27 | hue | Color shift |
| 28–31 | spare | Reserved |

### Pose (MediaPipe, in-browser)

Discrete state machine (6 states) + continuous blendshapes:

**States** (triangle model: nose, left wrist, right wrist):
- `neutral`, `compact`, `expansive`, `elevated`, `leftReach`, `rightReach`
- 4-frame debounce, 600ms eased crossfade between transitions
- Per-state weights (0→1) allow smooth scene blending

**Face signals** (MediaPipe):
- `face.mouthOpen`, `face.browUp`, `face.eyeSquint`, `face.smile`, `face.browDown`
- Not yet wired to scenes — design in progress

See `docs/signal-mapping.md` for full signal→scene matrix.

### Phone (MobMuPlat OSC)

| Control | OSC path | Effect |
|---------|----------|--------|
| 4-way selector | `/phone/mode` | Scene select (0=drift, 1=debris, 2=signalLoss, 3=reentry) |
| Intensity slider | `/phone/intensity` | Global energy envelope (0.2–0.4 gentle, 0.8–1.0 dramatic) |
| XY pad | `/phone/x` `/phone/y` | Color temperature (x) + density/zoom (y) |
| Panic button | `/phone/panic` | Impulse → blackout ~250ms |

Point MobMuPlat to `<rog_ip>:9000`. Layout file: `phone/pendulum.mmp`. See `phone/README.md`.

## Architecture

### Signal bus (central nervous system)

`visuals/src/bus.ts` is the single source of truth. Every input (OSC, Web Audio, MediaPipe, Web MIDI) writes flat dotted-key signals with one-pole smoothing. Scenes read via `get(key)` / `pulse(key)` closures — never capture raw values, or visuals freeze on reload.

```
┌─ Remote OSC (MIDI sender, phone) ──► bridge ──► WS JSON ──┐
├─ Web Audio (Nord line-in) ────────────────────────────────┼─► bus ──► scenes
├─ MediaPipe (pose/face WASM) ──────────────────────────────┤
└─ Web MIDI (single-machine) ───────────────────────────────┘
```

### Scenes (4 reactive modes)

`visuals/src/scenes.ts`: `drift`, `debris`, `signalLoss`, `reentry`. Each is a function that patches the global Hydra synth using reactive closures. Director (`visuals/src/director.ts`) switches mode based on `/phone/mode` (integer 0..3) and handles blackout on `/phone/panic`.

No time-based FSM — the performance is pure improv; the phone is the only scripted control surface.

### MediaPipe (in-browser, WASM)

`visuals/src/mediapipe.ts`: PoseLandmarker (33 points) + FaceLandmarker (468 points) on camera input. Writes pose state weights and face blendshapes to bus. Skeleton overlay (`m` key) shows green pose + cyan face dots for live verification.

## Docs

- **`docs/bringup.md`** — step-by-step bring-up (cold start to verified reactivity)
- **`docs/signal-mapping.md`** — complete signal → scene effect matrix (audio, MIDI, pose, face, phone)
- **`docs/osc-addresses.md`** — OSC address table (sender, future Ableton, phone, derived bus keys)
- **`docs/abletonosc.md`** — Ableton integration (MIDI sender is primary; AbletonOSC is future/low-priority)
- **`phone/README.md`** — MobMuPlat setup and layout guide

## Project structure

```
bridge/                  Node.js WS server (plain ESM, no build)
├─ index.mjs             OSC UDP 9000 → WS 9001 fan-out
└─ package.json

visuals/                 Vite + TypeScript + Hydra + MediaPipe
├─ src/
│  ├─ main.ts           Entry point, setup UI, WS client
│  ├─ bus.ts            Signal store (smoothing, impulses)
│  ├─ audio.ts          Web Audio RMS/centroid/onset
│  ├─ mediapipe.ts      PoseLandmarker + FaceLandmarker
│  ├─ pose-states.ts    Triangle state machine (6 states)
│  ├─ scenes.ts         4 Hydra scene functions
│  ├─ director.ts       Mode switch + panic logic
│  ├─ debug.ts          Signal monitor overlay
│  ├─ settings.ts       Rehearsal tuning panel
│  └─ midi.ts           Web MIDI controller input
├─ index.html           Main page (settings div, canvas)
└─ package.json

sender/                  MIDI→OSC forwarder (Mac mini only)
├─ midi-to-osc.mjs      easymidi → OSC bridge
├─ .env, .env.example
└─ package.json

scripts/
└─ test-osc.mjs         Synthetic OSC test sender

docs/                   Specifications + setup guides
phone/                  MobMuPlat layout + README
notes/
├─ status.md            Current project status snapshot
└─ log.md               Session decision log (append-only)
```

## Known gaps (v1)

- Second pose tracker stubbed in UI — add second PoseLandmarker for two-performer tracking
- Face blendshapes wired to bus but not yet connected to scenes — interaction model pending user feedback
- MobMuPlat layout untested on actual phone — needs verification
- AbletonOSC integration low-priority — MIDI sender covers main control path
- OBS recording pipeline — user has OBS experience, no additional code needed

## Conventions

- Bridge is plain `.mjs` (ESM, no build) for zero-overhead restarts during load-in
- Visuals are TypeScript via Vite with loose `strict` mode (`noImplicitAny: false`) due to Hydra's dynamic nature
- Reactive parameter functions in scenes must be tiny and branchless (run every frame)
- Bus keys follow OSC convention: `/a/b/c` → `a.b.c`
- When adding a new signal, update `docs/osc-addresses.md` first, then wire it through bus/scenes
