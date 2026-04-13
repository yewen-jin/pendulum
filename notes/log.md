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
