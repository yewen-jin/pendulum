# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Live visualiser for a two-person experimental music performance (working title **pendulum**). Pure-improv set — no scripted timeline. Visuals run autonomously, reacting to player input rather than a human VJ. Aesthetic keywords: post-apocalyptic, spaceship, post-war, on escape.

## Two-machine setup (physical)

- **Mac mini (M1, 16GB)** — Ableton + M4L instruments + Nord Rock 2 through an SSL2 interface. Sends OSC to the visual machine.
- **ROG G533Z (Windows 10)** — runs `bridge/` (Node) and `visuals/` (browser). MediaPipe pose tracking + Web Audio Nord analysis + OBS capture all happen here.
- Nord is **Y-split** before SSL2: one leg to SSL2 for Ableton, one leg to ROG line-in for direct audio analysis. Keeps the visual reacting to dry Nord regardless of Ableton's mix.
- Both machines + the performer's phone (MobMuPlat) join a dedicated travel router. ROG gets a static IP; AbletonOSC and MobMuPlat target `<rog_ip>:9000`.

## Commands

```sh
# Bridge (no build, plain ESM Node) — runs on ROG
cd bridge && npm install && npm start          # OSC:9000 → WS:9001
cd bridge && npm run dev                       # same, with --watch

# Visuals (Vite) — runs on ROG
cd visuals && npm install
cd visuals && npm run dev                      # http://localhost:5173
cd visuals && npm run build                    # static output in dist/

# MIDI sender — runs on Mac mini
cd sender && npm install
BRIDGE_HOST=<rog_ip> npm start                 # reads MIDI, sends OSC to ROG
npm run list                                   # list available MIDI devices

# Test OSC sender — for smoke testing without hardware
node scripts/test-osc.mjs                      # synthetic signals → bridge
```

Hotkeys in the visuals page: `d` toggles the signal-monitor overlay (essential during rehearsal for tuning OSC ranges), `f` goes fullscreen.

## Architecture

### Signal flow

```
Mac mini:
  sender/midi-to-osc.mjs ─OSC─┐   (reads MIDI controller via easymidi)
  Phone (MobMuPlat) ────OSC────┤
                               ▼
ROG:                   bridge/ (Node, UDP 9000 → WS 9001) ──► browser
  Nord ─lineIn────────────────────────────────► audio.ts (Web Audio)
  Webcam(s) ──────────────────────────────────► mediapipe.ts (WASM)
  MIDI controller (if USB to ROG) ────────────► midi.ts (Web MIDI, fallback)
```

The **bus** (`visuals/src/bus.ts`) is the single source of truth. Every input — remote OSC, Web Audio analysis, MediaPipe landmarks — writes into a flat dotted-key signal store with one-pole smoothing. Impulses (MIDI note, onset, panic) are separate and decay linearly. Hydra scene code reads via `get(key)` / `pulse(key)` getters so scenes never need to be re-patched when values change.

Raw MediaPipe landmarks bypass the bus (they're not scalars). For scenes that anchor geometry to a body position, use `getKeypointsSmoothed(tag)` from `mediapipe.ts` — it returns one-euro-filtered coordinates so static poses don't jitter while fast gestures still read. `getKeypoints(tag)` stays for the skeleton overlay and motion derivatives that want the raw signal. `audio.rms` is also pre-smoothed with a one-euro in `audio.ts` because fixed-α traded jitter for attack lag. The filter lives in `visuals/src/filters/one-euro.ts` if you need another instance.

### OSC convention

OSC path `/a/b/c` maps to bus key `a.b.c`. See `docs/osc-addresses.md` for the full table (`/ableton/*`, `/phone/*`, and derived `audio.*`, `pose.*`).

### Scenes / director

`visuals/src/scenes.ts` defines 4 modes: `drift`, `debris`, `signalLoss`, `reentry`. Each is a function that patches the global Hydra instance using reactive closures over the bus. `visuals/src/director.ts` switches mode based on `/phone/mode` (integer 0..3) and handles the `/phone/panic` blackout. **No time-based FSM** — the performance is improv, the phone is the only scripted control surface.

### MediaPipe

Runs **in-browser** via `@mediapipe/tasks-vision` (WASM + GPU backend). Avoids a separate Python process. v1 tracks one performer at a time; extending to two requires a second `PoseLandmarker` instance writing to `pose.p2.*` keys — state is already namespaced in `mediapipe.ts`.

### Audio analysis

The Nord audio arrives on the ROG's line-in. `visuals/src/audio.ts` runs a single `AnalyserNode` → derives `audio.rms`, `audio.centroid` (spectral centroid, 200–6000 Hz mapped to 0..1), and an `audio.onset` impulse (fast-env / slow-env ratio). Gain is boosted 4× because SSL2's consumer line-in is usually quiet for these signals.

## Working on scenes

Scenes live in `visuals/src/scenes.ts`. Vite HMR reloads on save but **Hydra's output needs re-patching** when the module reloads — currently achieved by `director.ts` calling `applyMode` on each mode switch, and by reloading the page on larger edits. If you find yourself iterating heavily on a single scene, temporarily wire a keyboard shortcut that calls `applyMode(h, currentMode())`.

Scene functions should only use bus getters (`get`, `pulse`) for reactive parameters — never capture raw values, or the visual will freeze.

### MIDI (dual path)

**Web MIDI** (`visuals/src/midi.ts`): browser reads USB MIDI directly. Works for single-machine testing (Mac mini). Writes `midi.cc.<N>` bus keys.

**MIDI→OSC sender** (`sender/midi-to-osc.mjs`): runs on Mac mini for two-machine setup. Reads MIDI via `easymidi`, sends `/midi/cc/<N>` OSC to ROG bridge. Same bus keys as Web MIDI — scenes are path-agnostic.

MIDI controller: **Channel 2, CC 16–31** (16 knobs). Mapping: cc16=density, cc17=color, cc18=kaleid, cc19=speed, cc20=modulation, cc21=feedback, cc22=rotation, cc23=zoom, cc24=glitch, cc25=brightness, cc26=pixelate, cc27=hue, cc28–31=spare.

## Task tracking

See `WORKFLOW.md` for the consolidated TODO list, progress, and session log. That file is the single source of truth for what's done and what's next.

## Conventions

- Bridge is plain `.mjs` (no TS build step) because it's tiny and we want zero-overhead restarts during load-in.
- Visuals are TypeScript via Vite. Loose `strict` — `noImplicitAny: false` — because Hydra is dynamic.
- Keep reactive parameter functions tiny and branchless in `scenes.ts`; they run every frame.
- When adding a new OSC path, update `docs/osc-addresses.md` first, then wire it on the Ableton/phone side, then optionally reference it in a scene.
- **Atomic commits** — one commit per logical change. Format: `<type>: <what> (<scope>)`. See `WORKFLOW.md` for details.
- **Update WORKFLOW.md** after every task: check off completed items, add new TODOs, update current session block.

## Subagent workflow

The main session dispatches tasks to specialized subagents and verifies their output. This keeps the main context light across a long project lifetime. Every subagent starts cold — each brief must stand alone and point at the files it needs.

### Roles

| Role              | Model  | When to dispatch                                                                 |
| ----------------- | ------ | -------------------------------------------------------------------------------- |
| `scene-dev`       | Opus   | Iterate or add a Hydra scene (in `visuals/src/scenes.ts`).                       |
| `signal-mapper`   | Sonnet | Add/rename an OSC path, thread it through `bus.ts` and scenes, update docs.      |
| `hw-integrator`   | Sonnet | M4L patch text, AbletonOSC config, MobMuPlat layout/addresses.                   |
| `feature-builder` | Opus   | Larger features — second pose tracker, FaceLandmarker, in-browser recorder, etc. |
| `notes-keeper`    | Haiku  | Run after each substantive turn, in background, to append to the session log.    |

### Brief checklist

A good subagent brief includes:
1. One-sentence goal.
2. Which files to read first (always include `CLAUDE.md` + relevant module).
3. Concrete acceptance criteria ("scene foo responds to `pose.motion` with kaleid rotation").
4. Constraint reminders ("reactive closures only — never capture raw bus values").
5. Expected deliverable format (patched files vs. returned text).

### Things the main session cannot verify

- Visual output (projection, colors, motion feel) — rely on user screenshots and verbal feedback.
- Audio latency / onset sensitivity — rely on user's subjective report.
- MediaPipe tracking quality on the actual ROG webcam — rely on debug overlay screenshots.

Do not pretend to have tested these. Ask the user to run and report.
