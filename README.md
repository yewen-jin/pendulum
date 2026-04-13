# pendulum

Live visualiser for a two-person experimental music set. Autonomous (no VJ) — visuals react continuously to Ableton + Nord Rock 2 + MediaPipe pose + phone OSC. Aesthetic: post-apocalyptic / spaceship / on-escape.

Two machines, one router:

- **Mac mini** — Ableton + Nord via SSL2, sends OSC to bridge
- **ROG (Win10)** — bridge + browser visualiser + MediaPipe + OBS record

## Run

```sh
# ROG (visual machine)
cd bridge && npm install && npm start          # OSC:9000 -> WS:9001
cd visuals && npm install && npm run dev       # http://localhost:5173
```

First browser load prompts for Nord audio input + camera(s). Selections persist.

Open the page, press **`f`** for fullscreen, **`d`** for debug signal overlay. OBS captures the window.

## Input wiring

```
Nord ──Y-split─┬─► SSL2 in1 ──USB──► Mac mini (Ableton)
               └─► ROG line-in ──► Web Audio (FFT/RMS/centroid)

Ableton ──M4L or AbletonOSC──UDP 9000──► ROG bridge
MobMuPlat ───────────────────UDP 9000──► ROG bridge
MediaPipe (in-browser WASM) on ROG webcams
```

Phone + both machines on the same travel router. Assign ROG a static IP; point AbletonOSC and MobMuPlat there on 9000.

## Docs

- `docs/osc-addresses.md` — full address map (Ableton + phone) and derived bus keys
- `docs/abletonosc.md` — Ableton side setup

## Structure

```
bridge/     Node WS server, OSC → WS fan-out (no build)
visuals/    Vite + TS + Hydra + MediaPipe Tasks, browser-only
docs/       Specs + setup notes
```

## v1 scope / known gaps

- Single pose tracker (one performer at a time). Second camera input plumbing is stubbed.
- Face blendshapes not yet wired (add `FaceLandmarker` alongside `PoseLandmarker`).
- Four demo modes in `visuals/src/scenes.ts` — iterate these during rehearsal.
- No Ableton-side M4L device bundled; follow `docs/abletonosc.md`.

- 
