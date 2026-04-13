# pendulum session log

Running log of design decisions, built artifacts, open questions, and next steps. Append-only. Obsidian-friendly.

Each entry is a level-2 heading with ISO date + topic. Inside, four fixed bullet sections: **Decided / Built / Open questions / Next**.

---

## 2026-04-13 — Scaffold + first-step bring-up validation

**Decided:**
- Session notes live in local `notes/log.md` (Obsidian vault), not Notion
- Subagent workflow formalized in `CLAUDE.md`: scene-dev (Opus), signal-mapper (Sonnet), hw-integrator (Sonnet), feature-builder (Opus), notes-keeper (Haiku)
- First priority = signal→visual reactivity end-to-end (audio OR OSC), before Ableton/phone/MediaPipe setup
- Nord Y-split before SSL2: one leg to SSL2 (Ableton), one to ROG line-in (direct Web Audio); keeps visuals reacting to dry Nord
- Pure-improv set → no time-based FSM; phone-driven mode switch + continuous parameter morph

**Built:**
- Full scaffold: `bridge/` (Node WS, plain .mjs), `visuals/` (Vite + TS + Hydra + MediaPipe Tasks), `docs/`, `notes/`
- Bus + smoothing (`visuals/src/bus.ts`), Web Audio RMS/centroid/onset (`visuals/src/audio.ts`), MediaPipe pose (`visuals/src/mediapipe.ts`), 4 demo modes in `visuals/src/scenes.ts`, director (`visuals/src/director.ts`), debug overlay (`visuals/src/debug.ts`)
- `CLAUDE.md` with architecture + subagent workflow + "what the main session cannot verify" list
- `docs/osc-addresses.md` (OSC address table), `docs/abletonosc.md` (Ableton setup)
- hw-integrator deliverables: `scripts/test-osc.mjs` (zero-dep UDP OSC sender at 20Hz for phone.intensity / ableton.cc.71 / phone.mode / phone.panic), `docs/bringup.md` (full bring-up checklist)
- hw-integrator code review: Hydra API usage confirmed (`detectAudio:false`, `makeGlobal:true`, `.add(shape, fn)` form, `gradient` generator); `bus.ts` comma-operator cleaned up

**Open questions:**
- Is `drift` scene's reactivity obvious enough for smoke test? hw-integrator flagged crosshair (0.003 wide, 35% opacity, 250ms) may be too subtle. Proposed (not yet applied) tweak: `audio.ts` rms boost 4→6, `scenes.ts` shape edge 0.002→0.006. Main session's call: wait for user to observe first before tuning.
- MobMuPlat layout not designed yet
- Second pose tracker stubbed; FaceLandmarker not wired

**Next:**
- User runs bring-up on ROG per `docs/bringup.md` and reports what they see (plus console errors if any)
- Based on that: either tune reactivity (scene-dev) or move to M4L/AbletonOSC wiring (hw-integrator)
- MobMuPlat layout as a parallel track once audio path is confirmed

## 2026-04-13 — Signal path validated + MIDI CC mapping

**Decided:**
- Dropped M4L oscformat approach — Max bundled with user's Ableton lacks `oscformat`
- WebMIDI in browser for single-machine testing; `sender/midi-to-osc.mjs` (Node script on Mac mini) for two-machine performance
- MIDI controller uses Channel 2, CC 16–31 (16 knobs)
- CC mapping: cc16=density, cc17=color, cc18=kaleid, cc19=speed, cc20=modulation, cc21=feedback, cc22=rotation, cc23=zoom, cc24=glitch, cc25=brightness, cc26=pixelate, cc27=hue, cc28-31=spare
- User confirmed "手感还行" — signal→visual reactivity validated on Mac mini

**Built:**
- `visuals/src/midi.ts` — Web MIDI API, reads all controllers, writes to `midi.cc.<N>` bus keys
- `sender/` directory with `midi-to-osc.mjs` — runs on Mac mini, reads MIDI via easymidi, sends OSC to ROG bridge. Zero M4L dependency.
- `ableton/pendulum-midi.maxpat` — written but NOT usable (oscformat missing). Kept as reference.
- `scripts/test-osc.mjs` — synthetic OSC sender for smoke tests (created by hw-integrator subagent)
- `docs/bringup.md` — bring-up checklist (created by hw-integrator subagent)
- All 4 Hydra scenes (`drift`, `debris`, `signalLoss`, `reentry`) wired to CC 16–31 with per-scene parameter mapping
- Bug fixes: `vite.config.ts` added `global: globalThis` (hydra-synth CJS compat); `main.ts` camera probe fallback for Mac mini (no webcam)

**Open questions:**
- AbletonOSC still partially installed on Mac mini (user added config.py manually which won't work) — clean up or revisit later for transport/track data
- MediaPipe not tested yet (skipped intentionally — no camera on Mac mini)
- Face blendshapes not wired
- Second pose tracker stubbed but not functional
- MobMuPlat layout not designed
- Scene aesthetic needs iteration with user once on projector — current scenes are functional placeholders
- Nord audio analysis not tested with actual Nord (only verified with mic/line-in)

**Next:**
- Test on ROG (two-machine setup): bridge on ROG, sender on Mac mini, verify OSC over LAN
- MediaPipe pose tracking once ROG webcam available
- MobMuPlat layout design (scene switch + intensity + panic)
- Scene aesthetic iteration — user keywords: post-apocalyptic, spaceship, post-war, on escape
- OBS recording setup on ROG

## 2026-04-13 — Docs update + .env + settings UI

**Decided:**
- AbletonOSC doc corrected: `config.py` doesn't exist (real config is `constants.py`), AbletonOSC is request-response not broadcast, subscription logic not written. Marked low priority — MIDI sender covers main control path.
- M4L device marked as abandoned in docs (oscformat missing). Superseded by Node sender.
- MIDI sender promoted to recommended approach in `docs/abletonosc.md`.
- Sender uses `.env` file (via dotenv) for BRIDGE_HOST/BRIDGE_PORT instead of requiring inline env vars every run.
- Visuals connection settings (bridge WS host/port) editable from a hidable settings panel toggled with `s` key.

**Built:**
- Updated `docs/abletonosc.md` — rewrote completely: MIDI sender as recommended path, AbletonOSC marked future/non-functional with corrected setup steps, M4L marked abandoned
- Updated `docs/osc-addresses.md` — added MIDI sender section (the primary working path), marked Ableton section as future, expanded derived bus keys table (added `pose.*.cx`, all `midi.*` Web MIDI keys, noted sender/WebMIDI key equivalence)
- Updated `docs/bringup.md` — fixed camera-optional flow in step 5, added MIDI controller signals to debug overlay table (step 6), added step 6b for two-machine MIDI sender setup, expanded drift scene description with all CC knob effects (step 7), added MIDI troubleshooting section (Web MIDI + sender paths)
- Created `sender/.env` and `sender/.env.example` with BRIDGE_HOST=127.0.0.1, BRIDGE_PORT=9000
- Added `dotenv` dependency to sender, `import 'dotenv/config'` in `midi-to-osc.mjs`
- Created `visuals/src/settings.ts` — hidable settings panel for bridge WS host/port, saves to localStorage, live URL preview, reload on save
- Added `#settings` div + terminal-aesthetic CSS to `visuals/index.html`
- `visuals/src/main.ts` now uses `getBridgeUrl()` from settings instead of hardcoded URL
- Guarded `d`/`f` hotkeys in `debug.ts` so they don't fire while typing in settings input fields

**Open questions:**
- Two-machine LAN test still pending (bridge on ROG + sender on Mac mini over travel router)
- Settings panel only covers bridge connection — should it include audio gain, smoothing alpha, or other tuning params?
- Should `notes/status.md` be updated to reflect docs overhaul and new settings UI?

**Next:**
- Two-machine LAN test

## 2026-04-13 — Local setup on ROG + bridge/visuals bring-up

**Decided:**

- All three npm packages (`bridge/`, `visuals/`, `sender/`) installed locally on ROG for dev workflow
- Chrome access via `http://localhost:5173` for frontend, WebSocket to `ws://localhost:9001` for bridge

**Built:**

- npm install completed: `bridge/` (13 packages), `visuals/` (50 packages), `sender/` (22 packages)
- Vite dev server running on http://localhost:5173 (HMR enabled)
- Bridge OSC/WS server running on 0.0.0.0:9000 (UDP) + 0.0.0.0:9001 (WS)
- WebSocket client connection successful: `[ws] client connected (1 total) from 127.0.0.1`
- Git pull completed: docs/ updated (abletonosc.md, bringup.md, osc-addresses.md all refreshed)

**Open questions:**

- None identified; system up and connected

**Next:**

- Confirm MIDI signal flow from Mac mini sender to ROG bridge (verify OSC 9000 packets arrive)
- Test actual MIDI controller on Mac mini with sender/midi-to-osc.mjs
- Run live improv test once signal path fully validated

## 2026-04-13 — Docs update + .env + settings UI

**Decided:**

- AbletonOSC doc corrected: `config.py` doesn't exist (real config is `constants.py`), AbletonOSC is request-response not broadcast, subscription logic not written. Marked low priority — MIDI sender covers main control path.
- M4L device marked as abandoned in docs (oscformat missing). Superseded by Node sender.
- MIDI sender promoted to recommended approach in `docs/abletonosc.md`.
- Sender uses `.env` file (via dotenv) for BRIDGE_HOST/BRIDGE_PORT instead of requiring inline env vars every run.
- Visuals connection settings (bridge WS host/port) editable from a hidable settings panel toggled with `s` key.

**Built:**

- Updated `docs/abletonosc.md` — rewrote completely: MIDI sender as recommended path, AbletonOSC marked future/non-functional with corrected setup steps, M4L marked abandoned
- Updated `docs/osc-addresses.md` — added MIDI sender section (the primary working path), marked Ableton section as future, expanded derived bus keys table (added `pose.*.cx`, all `midi.*` Web MIDI keys, noted sender/WebMIDI key equivalence)
- Updated `docs/bringup.md` — fixed camera-optional flow in step 5, added MIDI controller signals to debug overlay table (step 6), added step 6b for two-machine MIDI sender setup, expanded drift scene description with all CC knob effects (step 7), added MIDI troubleshooting section (Web MIDI + sender paths)
- Created `sender/.env` and `sender/.env.example` with BRIDGE_HOST=127.0.0.1, BRIDGE_PORT=9000
- Added `dotenv` dependency to sender, `import 'dotenv/config'` in `midi-to-osc.mjs`
- Created `visuals/src/settings.ts` — hidable settings panel for bridge WS host/port, saves to localStorage, live URL preview, reload on save
- Added `#settings` div + terminal-aesthetic CSS to `visuals/index.html`
- `visuals/src/main.ts` now uses `getBridgeUrl()` from settings instead of hardcoded URL
- Guarded `d`/`f` hotkeys in `debug.ts` so they don't fire while typing in settings input fields

**Open questions:**

- Two-machine LAN test still pending (bridge on ROG + sender on Mac mini over travel router)
- Settings panel only covers bridge connection — should it include audio gain, smoothing alpha, or other tuning params?
- Should `notes/status.md` be updated to reflect docs overhaul and new settings UI?

**Next:**

- Two-machine LAN test
- MediaPipe pose tracking on ROG with webcam
- MobMuPlat layout design
- Scene aesthetic iteration under projector

## 2026-04-13 — Rehearsal tuning panel + MediaPipe skeleton overlay + two-machine validation

**Decided:**
- Web settings panel for bridge connection was redundant — `location.hostname` auto-derives the correct WS URL. Repurposed into a rehearsal tuning panel instead.
- Sender `.env` requires restart after editing (dotenv reads once at startup). CLI env vars override `.env` values.
- Two-machine setup confirmed working: MIDI from Mac mini sender → ROG bridge over LAN, plus direct audio into ROG.
- MediaPipe code was already built but never tested. User now has webcam on ROG ready to test.

**Built:**
- Repurposed settings panel (`s` key) into **rehearsal tuning panel** with live sliders:
  - Scene override dropdown (bypass phone control, pick scene directly)
  - Audio gain slider (1×–10×, was hardcoded 4×) — wired into `audio.ts`
  - Smoothing α slider (0–0.99, was hardcoded 0.8) — wired into `bus.ts` default
  - Impulse decay slider (50ms–1000ms, was hardcoded 250ms) — wired into `bus.ts`
  - Pose gain slider (5–100, was hardcoded 40) — wired into `mediapipe.ts`
- All tuning values take effect immediately (no reload), persist in localStorage via `config` object
- **Reset all** button in settings panel — clears all localStorage (tuning + device selection), reloads page, re-shows setup screen
- **MediaPipe skeleton overlay** (`m` key) — shows camera feed with green skeleton (33 landmarks + connections) drawn in bottom-right corner. Useful for verifying pose tracking is working.
- Removed bridge URL from settings panel, restored auto-derived `ws://location.hostname:9001` in `main.ts`
- Updated hotkey hints in settings panel: `s` close, `d` debug, `m` skeleton, `f` fullscreen
- Guarded `m` key from firing while typing in input fields

**Open questions:**
- MediaPipe pose tracking not yet confirmed working — user has webcam, needs to select camera in setup screen and check `pose.*` signals in debug overlay
- Does the pose gain default (40) feel right, or does it need tuning once camera is live?
- Should the skeleton overlay also show derived values (motion, openness) as text?

**Next:**
- Confirm MediaPipe tracking works on ROG with webcam (check `pose.motion`, `pose.openness` in debug overlay)
- MobMuPlat phone layout design (scene switch + intensity + panic)
- Scene aesthetic iteration under projector
- Consider adding more tuning params to rehearsal panel as needed

## 2026-04-13 — Discrete pose states + FaceLandmarker + MobMuPlat layout

**Decided:**
- Replace continuous jittery pose signals with **discrete state machine** based on a triangle model (nose, left wrist, right wrist). Three distances define the triangle; classification maps to named states.
- 6 pose states: neutral, compact, expansive, leftReach, rightReach, elevated
- States have debounced transitions (4-frame debounce) with eased crossfade (600ms ease-in-out-quad) to prevent visual jitter
- Per-state bus weights (0→1) allow scenes to blend smoothly between states
- Facial model stays continuous/nuanced — different interaction approach to be designed separately
- Raw continuous pose signals (`pose.motion`, `pose.openness`) still written alongside states for backwards compat

**Built:**
- `visuals/src/pose-states.ts` — new module: triangle distance calculation, state classifier with hysteresis, eased transition engine, per-state weight bus keys
- Wired `updatePoseState()` into mediapipe.ts loop — runs every frame after pose detection
- Bus keys: `pose.state.neutral`, `pose.state.compact`, `pose.state.expansive`, `pose.state.leftReach`, `pose.state.rightReach`, `pose.state.elevated` (each 0→1 with transitions), plus `pose.handDist`, `pose.noseToLeft`, `pose.noseToRight` (raw triangle)
- **FaceLandmarker** (feature-builder agent): wired alongside PoseLandmarker on same camera/frame. 5 face signals: `face.mouthOpen`, `face.browUp`, `face.eyeSquint`, `face.smile`, `face.browDown`. Graceful fallback if face init fails. Cyan face dots in skeleton overlay (`m` key).
- **MobMuPlat layout** (hw-integrator agent): `phone/pendulum.mmp` with panic button (top, red), scene selector (4-way), intensity slider (left, vertical), XY pad (right). Dark theme with green/amber accents. `phone/README.md` setup guide. Docs updated.
- MediaPipe pose tracking confirmed working on ROG with webcam
- Build passes clean

**Open questions:**
- Are the pose state classification thresholds right? User needs to test poses and report which states trigger correctly
- How should scenes respond to pose states? Each state could map to distinct visual character (compact=focused, expansive=wide, elevated=energetic)
- What nuanced interactions should face blendshapes drive? (deferred — user wants to think about this)
- Transition duration (600ms) — does it feel right or should it be tunable via settings panel?
- MobMuPlat layout untested on actual phone — need to verify widget behavior

**Next:**
- User tests pose state classification, reports which states feel right
- Wire pose states into scenes (scene-dev agent)
- Design face→visual interaction model
- Test MobMuPlat on phone
- Test FaceLandmarker on ROG (check `face.*` in debug overlay)

## 2026-04-13 — MobMuPlat PD patch routing

**Decided:**
- MobMuPlat may require a PD patch (`pendulum.pd`) to route widget values as OSC — not all MobMuPlat app versions auto-send OSC without explicit routing
- PD patch acts as safety net using only core libpd objects, no external dependencies
- Five widget addresses routed: `/phone/panic` (bang), `/phone/mode` (float), `/phone/intensity` (float), `/phone/x` (float), `/phone/y` (float)
- XY pad handled as two separate receivers since MobMuPlat sends x and y on distinct paths

**Built:**
- `phone/pendulum.pd` — new PD patch:
  - Five `[r address]` receivers (one per widget path)
  - Panic path uses `[t b]` to forward bang arglessly
  - Mode, intensity, x, y paths use `[msg]` to format values
  - All paths converge to single `[s toNetwork]` sender
  - Clean, minimal patch with only standard Pd objects
- `phone/pendulum.mmp` — updated MobMuPlat config with `"pdFile": "pendulum.pd"` so app loads patch on startup
- `phone/README.md` — added PD patch loading instructions, network config section explaining `[s toNetwork]`, and troubleshooting steps

**Open questions:**
- MobMuPlat layout and PD patch untested on actual phone
- Face blendshape → scene interaction design still pending
- Second performer camera still stubbed
- Scene aesthetic refinement under projector needed

**Next:**
- Test MobMuPlat + PD patch on actual phone (verify all 5 widget paths arrive at bridge)
- Scene aesthetic iteration on projector
- Face → visual interaction design
- Second performer camera support if performance time allows
