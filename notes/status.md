# pendulum — project status

Last updated: 2026-04-13

## What works
- Bridge (Node): OSC UDP 9000 → WS 9001 fan-out ✅
- Visuals (Vite + Hydra): 4 reactive scenes running at 1080p ✅
- Web Audio: RMS / centroid / onset from line-in ✅
- Web MIDI: direct controller read in browser (single-machine) ✅
- MIDI→OSC sender: Node script for two-machine setup ✅
- Debug overlay: press 'd' to see all signal values ✅
- Test OSC sender: synthetic signals for smoke test ✅
- Signal bus: smoothed, impulse-capable, flat dotted-key store ✅

## What doesn't work yet
- MediaPipe pose/face tracking (skipped — no camera on test machine)
- MobMuPlat phone controls (no layout designed)
- AbletonOSC integration (installed incorrectly, subscription logic not written)
- Two-machine LAN setup (not tested)
- OBS recording pipeline
- M4L device (oscformat not available in user's Max)

## Architecture
- Music machine: M1 Mac mini, Ableton + SSL2, runs `sender/midi-to-osc.mjs`
- Visual machine: ROG G533Z Win10, runs `bridge/` + `visuals/` + OBS
- Network: dedicated travel router, ROG gets static IP
- Nord: Y-split before SSL2 — one leg to Ableton, one to ROG line-in

## MIDI mapping (Channel 2)
CC16=density, CC17=color, CC18=kaleid, CC19=speed, CC20=modulation,
CC21=feedback, CC22=rotation, CC23=zoom, CC24=glitch, CC25=brightness,
CC26=pixelate, CC27=hue, CC28-31=spare

## Key files
- `bridge/index.mjs` — OSC→WS bridge
- `visuals/src/scenes.ts` — 4 Hydra scenes with CC mapping
- `visuals/src/bus.ts` — unified signal store
- `visuals/src/midi.ts` — Web MIDI reader
- `visuals/src/audio.ts` — Web Audio analysis
- `sender/midi-to-osc.mjs` — Mac mini MIDI→OSC forwarder
- `scripts/test-osc.mjs` — synthetic OSC test sender
- `docs/osc-addresses.md` — OSC address table
- `docs/bringup.md` — bring-up checklist
