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
- [x] Multi-renderer Phase 1: Renderer interface, HydraRenderer wrapper, scene registry
- [x] Multi-renderer Phase 2: ThreeRenderer + particle debris field scene (Three.js)
- [x] P5Renderer + body-lines scene (upper-body squiggly abstract figure)
- [x] Renderers reorganised into per-renderer subdirectories (hydra/, three/, p5/)
- [x] Hydra modes split into per-scene class files matching three/ and p5/ structure
- [x] bodyLines evolved with 4 co-existing layers (ribbons/silhouette/glow/inverse) crossfaded by pose state
- [x] debrisField anchored to pose keypoints (per-performer palette, gesture-driven spawn velocity)
- [x] Scene-tuning settings group (particleVelScale, particleViewScale, bodyLinesDropoutMs)
- [x] docs/scene-controls.md — per-scene reference for all renderers
- [x] sacredGeometry p5 scene — N-fold radial mandala anchored between performers
- [x] sacredGeometry rewritten as strict {n/k} tessellation (hex/square lattice, analytic intersection radius)
- [x] One-euro filter for MediaPipe landmarks + audio RMS; `getKeypointsSmoothed()` accessor
- [x] Face-driven camera: FaceLandmarker `facialTransformationMatrixes` → `face.yaw/pitch/roll` bus keys → debrisField orbit camera (scaled by `faceCamStrength`, gated by `faceHeadPose` toggle)

---

## TODO

### Active — current sprint

- [x] **Smooth jittery inputs across the board** — landed in one-euro
  filter module (`filters/one-euro.ts`) + `LandmarkSmoother` wired into
  each `PoseTracker`. New `getKeypointsSmoothed(tag)` accessor returns
  per-landmark filtered coordinates; raw `getKeypoints(tag)` kept for
  the skeleton overlay and motion derivatives. Audio.rms pre-smoothed
  with a one-euro (mincutoff 1Hz / beta 2.0) to kill per-frame noise
  while letting attacks read. Migrated sacredGeometry, particleDebris,
  bodyLines to the smoothed accessor.
- [x] **Two-camera support** — PoseTracker class, per-performer pose states, two skeleton panels, aggregate bus keys (MAX). `2ab69de`
- [x] **Debug UI grouping** — color-coded collapsible sections: AUDIO/POSE/FACE/MIDI/PHONE. `259b602`
- [x] **Multi-renderer Phase 1** — Renderer interface + HydraRenderer wrapper + registry. Director uses Renderer instead of raw Hydra. `7316e3e`
- [x] **Multi-renderer Phase 2** — ThreeRenderer + particle debris field scene (3000 particles, custom shaders, bus-reactive). `2d38cc0`
- [x] **P5Renderer + body-lines scene** — abstract upper-body figure as squiggly polylines reacting to pose/audio/MIDI. `159de04`
- [x] **Renderers reorganised** — per-renderer subdirectories (hydra/, three/, p5/) each with their own scenes + renderer class. `6690360`
- [x] **Hydra per-scene split** — drift/debris/signalLoss/reentry each in their own file implementing HydraScene; shared bus readers in signals.ts.
- [ ] **Multi-renderer Phase 3** — More Three.js/p5 scenes. Crossfade between renderers. See `docs/multi-renderer.md`.

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
**Focus:** Face-driven camera orbit for debrisField
**Status:** Shipped. FaceLandmarker matrix → face.yaw/pitch/roll bus keys; debrisField camera orbits via spherical coords, scaled by `faceCamStrength`, gated by `faceHeadPose` toggle. Pending live test on ROG.

---

## Session history

Legacy session log archived in `notes/log.md` (read-only, no longer updated).
`notes/status.md` removed — was fully superseded by milestones above.

| Date | Focus | Outcome |
|------|-------|---------|
| 2026-04-13 | Scaffold + bring-up | Full project scaffold, bus, audio, scenes, bridge, docs |
| 2026-04-13 | Signal path + MIDI | MIDI dual path, sender, CC mapping, all scenes wired |
| 2026-04-13 | Docs + settings | Rehearsal tuning panel, settings UI, doc overhaul |
| 2026-04-13 | ROG bring-up | npm install, bridge/visuals running, WS connected |
| 2026-04-13 | MediaPipe + phone | Pose states, FaceLandmarker, MobMuPlat layout + PD patch |
| 2026-04-14 | Workflow optimization | WORKFLOW.md created, CLAUDE.md cleaned up, atomic commit discipline |
| 2026-04-15 | Multi-renderer Phase 2 | ThreeRenderer + particle debris field scene; director handles cross-renderer switches (canvas replacement, Hydra tick neutered on destroy) |
| 2026-04-15 | P5Renderer + reorg | P5Renderer + body-lines scene; renderers reorganised into hydra/ three/ p5/ subdirectories; Hydra modes split into per-scene classes |
| 2026-04-15 | Keypoint-anchored scenes | body-lines rewritten as abstract keypoint ribbons; particle debris spawns from pose keypoints with per-performer palette; scene-tuning knobs exposed in rehearsal panel |
| 2026-04-15 | bodyLines state layers | ribbons/silhouette/glow/inverse layers crossfade by pose state; docs/scene-controls.md added |
| 2026-04-15 | sacredGeometry | p5 scene added then rewritten as strict {n/k} tessellation (hex/square lattice, analytic intersection radius, pose-state → math-parameter mapping) |
| 2026-04-15 | Input smoothing | one-euro filter module; LandmarkSmoother per PoseTracker; audio.rms pre-smoothed; `getKeypointsSmoothed()` accessor; live smoothing sliders in rehearsal panel |
| 2026-04-15 | Face-driven camera | FaceLandmarker transformation matrix → face.yaw/pitch/roll on bus; debrisField camera orbit; `faceHeadPose` toggle + `faceCamStrength` slider |
