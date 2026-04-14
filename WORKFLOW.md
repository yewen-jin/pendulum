# WORKFLOW.md

Single source of truth for task tracking, progress, and development process.
Updated every session. Read this first.

---

## Task lifecycle

Every task follows this sequence. No exceptions.

1. **Assess** — read the relevant files, understand current state
2. **Plan** — one-sentence goal + acceptance criteria (in this file under TODO)
3. **Dispatch or build** — subagent for feature work, main session for config/quick fixes only
4. **Verify** — run build, check types, test manually where possible
5. **Atomic commit** — one commit per logical change, descriptive message

### Commit conventions

```
<type>: <what changed> (<scope>)

type = feat | fix | refactor | docs | chore | style
scope = scenes | bus | mediapipe | bridge | sender | phone | settings | docs
```

Examples:
- `feat: add face blendshape wiring to drift scene (scenes)`
- `fix: guard skeleton overlay when no landmarks (mediapipe)`
- `refactor: extract pose classifier thresholds to config (pose-states)`

### Subagent dispatch rules

| Task type | Agent role | Model | Key constraint |
|-----------|-----------|-------|----------------|
| Hydra scene iteration | scene-dev | Opus | Reactive closures only |
| OSC path add/rename | signal-mapper | Sonnet | Update docs/osc-addresses.md first |
| Hardware/phone/Ableton | hw-integrator | Sonnet | Test on actual hardware |
| New module/architecture | feature-builder | Opus | Self-contained brief with acceptance criteria |

**Main session does**: coordination, config changes, quick fixes (<20 lines), commit, WORKFLOW.md updates.
**Main session does NOT**: write scene code, build new modules, wire signal paths.

---

## Completed milestones

- [x] Core scaffold: bus, audio, director, debug overlay, bridge
- [x] 4 Hydra scenes: drift, debris, signalLoss, reentry
- [x] MIDI dual path: Web MIDI + sender/midi-to-osc.mjs (CC 16-31)
- [x] MediaPipe PoseLandmarker (upper body, GPU delegate)
- [x] FaceLandmarker with 5 blendshapes (mouthOpen, browUp, eyeSquint, smile, browDown)
- [x] Discrete pose state machine (6 states, 4-frame debounce, 600ms eased crossfade)
- [x] Pose states wired into all 4 scenes
- [x] MobMuPlat layout + PD patch (panic, mode, intensity, XY pad)
- [x] Rehearsal tuning panel (audio gain, smoothing, impulse decay, pose gain)
- [x] Settings panel with scene override dropdown
- [x] Skeleton debug overlay (m key) with face landmark dots
- [x] Docs: osc-addresses, bringup, abletonosc, signal-mapping
- [x] Two-machine LAN validated (bridge on ROG + sender on Mac mini)

---

## TODO

### Active — current sprint

- [ ] **Two-camera support** — refactor mediapipe.ts to support two simultaneous PoseLandmarker instances. Second performer writes `pose.p2.*` bus keys. Two skeleton preview panels (not one). Acceptance: both camera feeds visible, both pose states tracked independently.
- [ ] **Debug UI grouping** — reorganize the debug overlay (`d` key) to group signals by category: audio, pose, face, midi, phone. Collapsible sections, visual hierarchy. Currently a flat alphabetical dump of all bus keys.
- [ ] **Multi-renderer architecture** — support Three.js, p5.js alongside Hydra. Each mode declares its renderer. Bus stays renderer-agnostic. Director manages renderer lifecycle. **Needs architecture plan before code** — see `docs/multi-renderer.md`.

### Priority 1 — Rehearsal-ready

- [ ] **Test MobMuPlat on actual phone** — verify all 5 OSC paths arrive at bridge. Blocked on user testing.
- [ ] **Test pose state thresholds on ROG** — are classify() thresholds right for actual performance poses? User reports.
- [ ] **Test FaceLandmarker on ROG** — check face.* signals in debug overlay. User reports.
- [ ] **Scene aesthetic iteration** — current scenes are functional placeholders. Need projector + user feedback. Keywords: post-apocalyptic, spaceship, post-war, on escape.

### Priority 2 — Performance features

- [ ] **Face blendshape -> scene wiring** — design how face signals modulate visuals. Not just "wire it" — need an interaction model (e.g., mouthOpen = aperture? browDown = distortion?).
- [ ] **In-browser recorder** — capture canvas output for documentation/promo. MediaRecorder API on canvas.

### Priority 3 — Polish

- [ ] **AbletonOSC subscription logic** — low priority, MIDI sender covers needs. Only if user wants transport/track data.
- [ ] **OBS recording config** — user has OBS experience, just needs setup guidance.
- [ ] **Pose state transition duration tunable** — add to settings panel (currently hardcoded 600ms).
- [ ] **Scene crossfade on mode switch** — currently hard-cuts between scenes.

### Backlog

- [ ] Per-scene CC mapping docs (currently inline comments only)
- [ ] Performance profiling on ROG (MediaPipe + Hydra + audio = GPU contention?)

---

## Current session

_Updated each session start. Cleared on commit._

**Date:** 2026-04-15
**Focus:** Two-camera support, debug UI grouping, multi-renderer architecture plan
**Status:** Planning multi-renderer architecture, dispatching feature work

---

## Session history

Detailed session log lives in `notes/log.md` (append-only).
This section tracks only high-level session outcomes.

| Date | Focus | Outcome |
|------|-------|---------|
| 2026-04-13 | Scaffold + bring-up | Full project scaffold, bus, audio, scenes, bridge, docs |
| 2026-04-13 | Signal path + MIDI | MIDI dual path, sender, CC mapping, all scenes wired |
| 2026-04-13 | Docs + settings | Rehearsal tuning panel, settings UI, doc overhaul |
| 2026-04-13 | ROG bring-up | npm install, bridge/visuals running, WS connected |
| 2026-04-13 | MediaPipe + phone | Pose states, FaceLandmarker, MobMuPlat layout + PD patch |
| 2026-04-14 | Workflow optimization | WORKFLOW.md created, CLAUDE.md cleaned up, atomic commit discipline |
