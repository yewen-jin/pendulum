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
- MediaPipe pose tracking on ROG with webcam
- MobMuPlat layout design
- Scene aesthetic iteration under projector
