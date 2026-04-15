# MobMuPlat phone layout — pendulum

Controller layout for the performer's phone. Runs on iOS or Android via the **MobMuPlat** app.

## Loading the layout

1. Install **MobMuPlat** from the App Store / Play Store.
2. Copy **both** `pendulum.mmp` and `pendulum.pd` to the MobMuPlat documents folder (iTunes File Sharing on iOS, or via a file manager on Android).
3. Open MobMuPlat → tap the document icon → select `pendulum`.
4. The layout loads with the embedded Pd patch (`pendulum.pd`) active. The patch routes all widget values to MobMuPlat's built-in network output via `[s toNetwork]`.

> **Note on the Pd patch:** Some versions of MobMuPlat send OSC directly without a Pd patch. The included `pendulum.pd` is a safety net — it receives each widget's value via `[r <address>]` and forwards it as a formatted OSC message to `[s toNetwork]`, which MobMuPlat intercepts and sends as UDP to the configured host:port. No external Pd libraries are required; only core libpd objects are used.

## Network setup

Both the phone and the ROG (visual machine) must be on the **dedicated travel router**.

In MobMuPlat settings (gear icon → **Settings → Network** or **OSC/Network**):
- **OSC output host** (destination IP): `<rog_ip>` — the static IP assigned to the ROG on the travel router (typically `192.168.1.XXX`; check the bridge startup log for the exact address)
- **OSC output port**: `9000`
- **OSC input port**: any (not used)

The bridge on the ROG listens on UDP 9000 and forwards to the browser over WS 9001. The Pd patch uses MobMuPlat's `[s toNetwork]` mechanism, so it respects whatever host:port you configure here — no IP is hardcoded in the patch.

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
│ drift  debris  sigLoss  reentry  particle  bodyLns  sacred      │
│ [────────────────── slider 0..6 ──────────────────────────────] │  ← horizontal slider, range 6, Pd floors to int
├──────────┬──────────────────────┤
│ INTENSITY│        X / Y         │
│          │                      │
│          │                      │
│  (tall   │    (XY pad, square)  │
│ vertical │                      │
│  slider) │                      │
│          │                      │
│          │                      │
├──────────┴──────────────────────┤
│            BLUE TOGGLE          │  ← run toggle → /phone/runToggle
└─────────────────────────────────┘
```

## Controls and OSC addresses

| Control | Widget | OSC path | Args | Notes |
|---|---|---|---|---|
| Panic | Button (momentary) | `/phone/panic` | none | Brief blackout only (~250 ms). Not a latched stop, reset, or mode change. Big red target top of screen. |
| Scene | MMPSlider (horizontal, `range:6`) | `/phone/mode` | int 0–6 | Slider float is floored to int by `[int]` in the Pd patch before forwarding. Maps left→right to scene indices 0=drift, 1=debris, 2=signalLoss, 3=reentry, 4=particleDebris, 5=bodyLines, 6=sacredGeometry. |
| Intensity | Slider (vertical) | `/phone/intensity` | float 0–1 | Global intensity multiplier. Default 0.6. |
| XY pad | XYSlider | `/phone/x`, `/phone/y` | float 0–1 each | Free parameter. MobMuPlat sends `/phone/x` and `/phone/y` as separate messages. |
| Blue toggle | Toggle | `/phone/runToggle` | int 0/1 | Now forwarded to the visuals as `/phone/runToggle` (bus key `phone.runToggle`). Can be used by scenes as a latching on/off toggle. The internal audio path inside `[pd readToseq]` also still receives `/runToggle` and is unaffected. |

> **Tip:** The PANIC button is deliberately at the top edge — far from the scene selector and sliders — so it can only be triggered intentionally. Reach it with your index finger while the thumb rides the intensity slider.
>
> **Blue toggle note:** the blue toggle now emits `/phone/runToggle` (int 0/1) to the visuals via the bus key `phone.runToggle`. You can use it as a latching on/off toggle in scenes. Its internal audio-synth role inside `[pd readToseq]` is preserved — both paths receive the value independently.

## One-handed use

The intensity slider is on the left third of the screen — thumb-accessible for a right-handed player. The XY pad fills the right two-thirds; sweep it with your thumb for expressive control. The scene selector is a horizontal slider spanning the full width just below the SCENE label; sweep it left or right to step through the 7 scenes. Panic is at the top, requiring you to shift grip.

## Troubleshooting

- **No response in visuals**: check `d` overlay in browser to confirm OSC signals arriving. Verify ROG IP and travel router connection.
- **Mode not switching**: the slider sends `/mode` as a float; the Pd `[int]` floors it to an integer before emitting `/phone/mode N` to the network. No sibling exclusivity logic is needed. If modes still don't switch after moving the slider, check that the visuals settings panel (press `s`) does not have a scene override enabled, and confirm OSC is arriving via the `d` overlay.
- **Panic seems unclear**: current behavior is intentionally minimal — it only triggers a brief blackout pulse and then returns to the active scene.
- **Blue button at the bottom**: this toggle now sends `/phone/runToggle` (0/1) to the visuals. Check the `d` overlay in the browser to confirm `phone.runToggle` updates when you press it.
- **Intensity slider starts at 0 on reload**: MobMuPlat resets widget state on reopen; nudge the slider once at show start to push the default 0.6 value to the bus.
