# Signal → scene mapping

How each input signal drives the visuals. All signals are read via `get()` / `pulse()` closures in `visuals/src/scenes.ts`.

## Audio (Web Audio — Nord line-in)

| Signal | Range | Effect |
|---|---|---|
| `audio.rms` | 0–1 | Noise density, threshold, scroll speed, voronoi count. Louder = more intense across all scenes. |
| `audio.centroid` | 0–1 | Color channel balance (high centroid = warmer reds, low = cooler blues). Gradient steepness in reentry. |
| `audio.onset` | impulse | Crosshair flash (drift), noise spike (debris/signalLoss), shape pop. Brief per-attack. |

## MIDI CC (Channel 2, CC 16–31)

| CC | Parameter | Effect across scenes |
|---|---|---|
| 16 | density/threshold | Noise grain (drift), voronoi count (debris), static density (signalLoss), shimmer (reentry) |
| 17 | color shift | RGB balance shift in all scenes |
| 18 | kaleidoscope | Symmetry segments (drift) |
| 19 | scroll/flow speed | Vertical scroll rate in drift, debris, reentry |
| 20 | modulation depth | Voronoi warp amount (drift, debris), noise warp (reentry) |
| 21 | feedback/smear | Modulation warp (signalLoss) |
| 22 | rotation | Canvas rotation + rotation speed in all scenes |
| 23 | scale/zoom | Global scale in all scenes |
| 24 | glitch amount | Noise intensity (debris), tear amplitude (signalLoss) |
| 25 | brightness/luma | Brightness (drift), threshold (debris), luma (signalLoss) |
| 26 | pixelate | Pixelation resolution (signalLoss) |
| 27 | hue rotate | Blue channel shift (drift) |
| 28–31 | spare | Reserved |

## Pose — discrete states (pose-states.ts)

Triangle model: 3 distances (nose↔left wrist, nose↔right wrist, left wrist↔right wrist) classified into 6 states. 4-frame debounce, 600ms eased crossfade between states.

| State | Trigger | drift | debris | signalLoss | reentry |
|---|---|---|---|---|---|
| `neutral` | relaxed, default | no modification | no modification | no modification | no modification |
| `compact` | hands together near face | tighter noise (-4), raised threshold, slower scroll | fewer voronoi (-15), slower | tighter scan (-30), less noise | tight shimmer, smaller scale |
| `expansive` | arms spread wide | wider noise (+6), more kaleid (+2), faster scroll, larger scale | more voronoi (+25), faster scroll | max tearing (+50), more pixelation | wide atmospheric wash, bigger scale |
| `elevated` | both hands above head | brightness boost, color saturation, shape intensity | intense modulation (+12), glitch warp | full glitch, bright, noise overload | peak brightness, shape expand, intense warp |
| `leftReach` | left arm extended | rotation bias +0.15 | scroll + rotation bias left | horizontal tear bias left | rotation bias left |
| `rightReach` | right arm extended | rotation bias -0.15 | scroll + rotation bias right | horizontal tear bias right | rotation bias right |

## Pose — continuous (legacy, still active)

| Signal | Range | Effect |
|---|---|---|
| `pose.motion` | 0–1 | Modulation depth (drift), noise intensity (debris). Jittery — may be replaced by state weights. |
| `pose.openness` | 0–1 | Voronoi complexity (drift), rotation speed (debris), shape size (reentry) |

## Pose — raw triangle distances (available, not wired to scenes)

| Signal | Range | Description |
|---|---|---|
| `pose.handDist` | 0–1 | Wrist-to-wrist distance × 1.5 |
| `pose.noseToLeft` | 0–1 | Nose to left wrist × 1.5 |
| `pose.noseToRight` | 0–1 | Nose to right wrist × 1.5 |
| `pose.p1.cx` | 0–1 | Body centroid X position |

## Face — blendshapes (available, not wired to scenes)

| Signal | Range | Source blendshape(s) | Potential use |
|---|---|---|---|
| `face.mouthOpen` | 0–1 | jawOpen | Singing/shouting → intensity |
| `face.browUp` | 0–1 | browInnerUp | Surprise → flash/expand |
| `face.eyeSquint` | 0–1 | avg(eyeSquintLeft, eyeSquintRight) | Concentration → focus/tighten |
| `face.smile` | 0–1 | avg(mouthSmileLeft, mouthSmileRight) | Joy → warmth/color shift |
| `face.browDown` | 0–1 | avg(browDownLeft, browDownRight) | Anger/intensity → distortion |

## Phone (MobMuPlat OSC)

| Signal | Range | Effect |
|---|---|---|
| `phone.mode` | int 0–3 | Scene selection: 0=drift, 1=debris, 2=signalLoss, 3=reentry |
| `phone.intensity` | 0–1 | Global intensity multiplier (crosshair mix in drift) |
| `phone.x` / `phone.y` | 0–1 | XY pad — available but not wired to scenes yet |
| `phone.panic` | impulse | Blackout (~250ms CSS overlay) |
