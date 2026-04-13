# MobMuPlat phone layout — pendulum

Controller layout for the performer's phone. Runs on iOS or Android via the **MobMuPlat** app.

## Loading the layout

1. Install **MobMuPlat** from the App Store / Play Store.
2. Copy `pendulum.mmp` to the MobMuPlat documents folder (iTunes File Sharing on iOS, or via a file manager on Android).
3. Open MobMuPlat → tap the document icon → select `pendulum`.
4. The interface loads immediately; no SuperCollider or Pd patch is needed — MobMuPlat sends raw OSC.

## Network setup

Both the phone and the ROG (visual machine) must be on the **dedicated travel router**.

In MobMuPlat settings (gear icon):
- **OSC output host**: `<rog_ip>` (the static IP assigned to the ROG on the travel router — typically `192.168.1.XXX`, check bridge startup log)
- **OSC output port**: `9000`
- **OSC input port**: any (not used)

The bridge on the ROG listens on UDP 9000 and forwards to the browser over WS 9001.

## Layout map

```
┌─────────────────────────────────┐
│           PENDULUM              │  ← title label
├─────────────────────────────────┤
│                                 │
│             PANIC               │  ← full-width red momentary button
│                                 │
├─────────────────────────────────┤
│ SCENE                           │
│ [drift][debris][sigLoss][reentry] │  ← segmented Menu, full width
├──────────┬──────────────────────┤
│ INTENSITY│        X / Y         │
│          │                      │
│          │                      │
│  (tall   │    (XY pad, square)  │
│ vertical │                      │
│  slider) │                      │
│          │                      │
│          │                      │
└──────────┴──────────────────────┘
```

## Controls and OSC addresses

| Control | Widget | OSC path | Args | Notes |
|---|---|---|---|---|
| Panic | Button (momentary) | `/phone/panic` | none | Impulse — blackout ~250 ms. Big red target top of screen. |
| Scene | Menu (4 segments) | `/phone/mode` | int 0–3 | 0=drift 1=debris 2=signalLoss 3=reentry |
| Intensity | Slider (vertical) | `/phone/intensity` | float 0–1 | Global intensity multiplier. Default 0.6. |
| XY pad | XYSlider | `/phone/x`, `/phone/y` | float 0–1 each | Free parameter. MobMuPlat sends `/phone/x` and `/phone/y` as separate messages. |

> **Tip:** The PANIC button is deliberately at the top edge — far from the scene selector and sliders — so it can only be triggered intentionally. Reach it with your index finger while the thumb rides the intensity slider.

## One-handed use

The intensity slider is on the left third of the screen — thumb-accessible for a right-handed player. The XY pad fills the right two-thirds; sweep it with your thumb for expressive control. The scene Menu is in the middle zone, reachable with a deliberate upward thumb stretch. Panic is at the top, requiring you to shift grip.

## Troubleshooting

- **No response in visuals**: check `d` overlay in browser to confirm OSC signals arriving. Verify ROG IP and travel router connection.
- **Mode not switching**: confirm MobMuPlat sends integer args — Menu widget sends integers by default in MobMuPlat.
- **Intensity slider starts at 0 on reload**: MobMuPlat resets widget state on reopen; nudge the slider once at show start to push the default 0.6 value to the bus.
