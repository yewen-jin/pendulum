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

## Face — head pose (FaceLandmarker transformation matrix)

Derived from MediaPipe's `facialTransformationMatrixes` (enabled via
`outputFacialTransformationMatrixes: true`). Each axis normalised so
±π/4 rad (±45°) → ±1, clamped. Gated by the `Head pose (yaw/pitch)`
toggle in the rehearsal panel.

| Signal | Range | Source | Effect |
|---|---|---|---|
| `face.yaw`   | -1 … 1 | atan2(m02, m22) / (π/4) | Three.js debrisField: orbits camera horizontally around the scene origin (scaled by `faceCamStrength`). |
| `face.pitch` | -1 … 1 | asin(-m12) / (π/4) | Three.js debrisField: orbits camera vertically (half yaw range — pitch is nausea-prone). |
| `face.roll`  | -1 … 1 | atan2(m10, m11) / (π/4) | Reserved. Not consumed by any scene yet. |

Per-performer keys `face.<tag>.{yaw,pitch,roll}` exist in parallel;
aggregates pick the signed value with the largest absolute magnitude
across active performers.

## Phone (MobMuPlat OSC)

| Signal | Range | Effect |
|---|---|---|
| `phone.mode` | int 0–3 | Scene selection: 0=drift, 1=debris, 2=signalLoss, 3=reentry |
| `phone.intensity` | 0–1 | Global energy envelope — scales brightness, warp depth, and scroll speed across all 4 scenes. Low (0.2–0.4) = gentle; high (0.8–1.0) = dramatic. |
| `phone.x` | 0–1 | XY pad horizontal — color temperature. 0=cool/blue, 1=warm/red. Shifts red channel up and blue channel down. Applied to all 4 scenes. |
| `phone.y` | 0–1 | XY pad vertical — density and zoom. 0=sparse/zoomed-out, 1=dense/zoomed-in. Adds to noise scale, voronoi count, osc frequency, and global scale across all 4 scenes. |
| `phone.panic` | impulse | Blackout (~250ms CSS overlay) |

### phone.intensity — per-scene detail

| Scene | Effect |
|---|---|
| `drift` | Lowers threshold (more stars visible), boosts brightness, speeds up voronoi scroll. Crosshair mix scales with intensity (0.35×). |
| `debris` | Increases modulation warp depth, speeds up vertical scroll. |
| `signalLoss` | Lowers threshold (more static), amplifies modulation smear, raises static noise mix. |
| `reentry` | Increases warp depth, speeds up vertical scroll. |

### phone.x — per-scene detail

| Scene | Color effect (x=0 cool → x=1 warm) |
|---|---|
| `drift` | Red channel +0.3, blue channel −0.35 on noise layer |
| `debris` | Osc color overlay: red +0.15, blue −0.30 |
| `signalLoss` | Red channel +0.2, blue channel −0.12 |
| `reentry` | Red +0.15, green −0.1, blue −0.08 on gradient |

### phone.y — per-scene detail

| Scene | Density/zoom effect (y=0 sparse → y=1 dense) |
|---|---|
| `drift` | Noise scale +6, global scale +0.25 |
| `debris` | Voronoi count +30, global scale +0.2 |
| `signalLoss` | Osc frequency +60, pixelation resolution −600 (more pixelated) |
| `reentry` | Shimmer noise scale +8, global scale +0.25 |
