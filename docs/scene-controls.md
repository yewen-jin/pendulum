# Scene controls

How each scene interprets the shared signal bus. This is the high-level
map — for the raw signal → parameter table across all Hydra scenes see
[`signal-mapping.md`](./signal-mapping.md); for OSC path definitions see
[`osc-addresses.md`](./osc-addresses.md).

Scenes are grouped by renderer. Each entry lists the *concept*, the
*state layers* (if any), the *primary controls*, and any
*panel-tunable knobs* exposed in the rehearsal settings.

---

## Hydra scenes

Four modes in `visuals/src/renderers/hydra/`, one class file each.
All share the same per-frame closures over the bus — see
`hydra/signals.ts` for the signal readers.

### drift (`drift.ts`)

Starfield + HUD. Post-apocalyptic calm, distant signals. Threshold
noise with voronoi modulation; brief crosshair pings on audio onset.

- **Pose:** `compact` tightens and stills; `expansive` widens and
  intensifies; `elevated` raises brightness + saturation; left/right
  reach bias the rotation.
- **MIDI:** cc16 density, cc17 colour, cc18 kaleid, cc19 flow, cc20
  modulation, cc22 rotation, cc25 brightness.
- **Phone:** intensity → brightness/flow; x → colour temperature;
  y → density/scale.

### debris (`debris.ts`)

Shards tumbling. Voronoi cells multiplied with oscillators, modulated
with noise, scrolled and rotated.

- **Pose:** `compact` → fewer cells, slower; `expansive` → more/faster;
  `elevated` → peak glitch; reach → scroll direction.
- **MIDI:** cc16 density, cc19 speed, cc20 warp, cc21 feedback,
  cc22 rotation, cc24 glitch.

### signalLoss (`signal-loss.ts`)

Broken CRT with tearing + static. Osc + heavy noise modulation,
randomised scroll, pixelation.

- **Pose:** `compact` → tighter scan, less noise; `expansive` → max
  tearing; `elevated` → full glitch/bright; reach → horizontal tear.
- **MIDI:** cc16 static density, cc17 colour, cc21 smear, cc24 glitch,
  cc26 pixelate.

### reentry (`reentry.ts`)

Heat / atmosphere. Gradient base coloured by centroid, warped by noise
and layered with bright shapes.

- **Pose:** `compact` → tight shimmer; `expansive` → wide atmospheric
  wash; `elevated` → peak bright/shape expand; reach → rotation.
- **MIDI:** cc16 shimmer, cc17 warmth, cc19 speed, cc20 warp,
  cc22 rotation, cc23 zoom.

---

## Three.js scenes

In `visuals/src/renderers/three/`.

### debrisField (`particle-debris.ts`)

A 3000-particle GPU point cloud whose emission is anchored to the live
pose keypoints. Each performer's upper-body landmarks (nose, shoulders,
elbows, wrists) act as spawn anchors; new particles inherit the
keypoint's per-frame velocity so gestures fling comets outward along
the motion direction. The whole cloud re-centres on the midpoint of
all active performers so compact/expansive forces operate in
body-local space.

**Per-performer palette** (via `aPerformer` vertex attribute):
- **p1:** cyan ↔ amber (centroid-controlled blend)
- **p2:** magenta ↔ crimson
- Untagged fallback (no pose) uses p1's palette.

**Pose controls:**
- `compact` → pull particles toward body centroid
- `expansive` → push outward from centroid
- `elevated` → lift (velocity.y bias)
- `leftReach - rightReach` → horizontal wind
- `motion` → overall velocity multiplier

**Audio:**
- `rms` → lifespan decay + spawn-radius breathing
- `centroid` → warm↔cool palette blend in fragment shader
- `onset > 0.3` → burst: up to 300 particles respawn at anchors with
  14-unit outward kick and 0.5–1.5s lifetime.

**MIDI CCs:** cc16 density gate, cc17 hue rotate, cc19 flow speed,
cc20 turbulence, cc21 trail (0=clear, 1=heavy smear), cc22 rotation,
cc23 zoom, cc24 glitch, cc25 brightness.

**Phone XY pad:** x → centroid offset; y → density ratio.

**Panel-tunable (Scene tuning group):**
- `particleVelScale` (0–200, default 80) — how hard a wrist throw
  flings new particles. Lower = slower, more floaty; higher = sharper
  comets.
- `particleViewScale` (0.3–2.0×, default 1.0) — world-space extent
  that pose coords map to. Raise if bodies look cramped in centre;
  lower if they spill off-screen.

**Fallback:** when no tracker is active, falls back to sphere spawn on
a 20-unit radius so the scene still looks alive pre-show.

---

## p5.js scenes

In `visuals/src/renderers/p5/`.

### bodyLines (`body-lines.ts`)

Abstract body geometry with **four co-existing visual treatments**
that crossfade automatically based on each performer's pose state.
The pose polygon drives both positive-space and negative-space fills
simultaneously — as a performer shifts posture, the pose-state
tracker's 600 ms eased crossfade smoothly dissolves between layers.

**State layers** (stacked bottom → top per performer):

| Layer | Space | Activated by | Visual |
|---|---|---|---|
| **ribbons** | — | always on (≥30% floor) | Catmull-Rom curves along arm chains with squiggle offsets, stacked 5 strokes deep for organic ribbon |
| **silhouette** | positive | `pose.state.compact` | body polygon filled with performer hue + soft shadowBlur outline |
| **glow** | radiant | `pose.state.expansive` | polygon fill with heavy shadowBlur halo bleeding outside the body |
| **inverse** | negative | `pose.state.elevated` | full-screen rect in complement colour with body polygon punched out as a hole via `beginContour` — trail/bg shows through |

**Why automatic:** `PoseStateTracker` already crossfades state weights
(eased 600 ms). During a compact→elevated transition, `wSil` fades
1→0 while `wInv` fades 0→1. Both layers render at ~0.5 simultaneously
producing a natural dissolve. Ribbons never fully fade (`RIBBON_FLOOR
= 0.3`) so limb articulation stays readable through every transition.

**Body polygon:** 7 core keypoints (wrists → elbows → shoulders →
nose → shoulders → elbows → wrists) + 2 estimated hip points
(shoulders offset down by `0.95 × bodyScale`), then Catmull-Rom
smoothed with wrap-around indices into ~90 curve points so the fill
matches the ribbons' organic feel.

**Per-performer palette:**
- **p1:** cool base hue 180° (cyan)
- **p2:** warm base hue 340° (magenta)
- Hue further shifted by centroid, cc17, elevated, compact, brows,
  plus a slow time rotation.

**Other pose controls within layers:**
- `motion` + `rms` → ribbon squiggle amplitude
- `openness` + `mouthOpen` → ribbon spread (perpendicular offset
  between stacked strokes)

**Audio:**
- `rms` → saturation + brightness
- `centroid` → hue shift
- `onset` → flash ring at sternum (gated by ribbon weight so it fades
  during silhouette/inverse where it'd be invisible)

**Face:** `browUp` warms, `browDown` cools, `eyeSquint` saturates.

**MIDI CCs:** cc17 hue shift, cc19 flow speed, cc20 squiggle,
cc21 trail amount, cc23 stroke weight, cc25 brightness, cc26 ribbon
spread.

**Panel-tunable (Scene tuning group):**
- `bodyLinesDropoutMs` (0–2000 ms, default 500) — how long a
  performer's layers linger after their pose tracker drops out.
  Raise to mask tracker flicker; lower to be strict.

**To remap state → layer assignments:** the three lines mapping
`wSil / wGlow / wInv` to `compact / expansive / elevated` in
`draw()` are trivial to swap if the feel reads wrong on stage.

### sacredGeometry (`sacred-geometry.ts`)

Radial mandala built from N-fold symmetry — composition of Islamic
geometry archetypes (flower of life, concentric rings, radial spokes,
N-gon, {N/k} star polygon, petal arcs, pointed star). The whole pattern
is **anchored between performers** so it visibly belongs to the room:
the centre lerps to the midpoint of all active shoulder midpoints, and
the radius scales with mean shoulder width (~3.5×). Geometry stays
crystalline (no squiggle noise) to preserve the contemplative feel —
audio reactivity comes through symmetry count, rotation, hue, and a
bell-strike onset ring.

**Layers (drawn bottom → top, all rotated together):**

1. **Flower of life** — 7 overlapping circles on a hex lattice (ghost
   alpha, base grid).
2. **Concentric rings** — count = `3 + cc16 * 7 + rms * 2`, each ring
   slightly modulated by RMS so the grid breathes.
3. **Radial spokes** — N straight lines from centre to each vertex.
4. **Outer N-gon** — regular polygon outline.
5. **{N/k} star polygon** — connect every k-th vertex; classic girih
   star pattern. k from cc20.
6. **Petal arcs** — quadratic-bezier inward curves between adjacent
   spokes; depth grows with `openness + expansive`.
7. **Pointed star** — 2N-vertex inner star (alternating outer/inner
   radius), inner radius lifted by `elevated`.
8. **Centre dot** — small filled disc, brightens on onset.
9. **Onset bell-ring** — concentric ring expands from centre on each
   `audio.onset`, NOT rotated with the mandala so the hit reads as a
   bell strike rather than a spin.

**Pose controls:**
- Centre + radius follow aggregate shoulder midpoint and shoulder width
- `compact` → reduces N (more legible, low symmetry)
- `expansive` → raises N, increases saturation, boosts petal depth
- `elevated` → lifts centre upward, brightens, grows inner star
- `leftReach - rightReach` → torques the rotation (asymmetric reach
  bends the mandala)
- `openness` → petal depth + radius breath

**Audio:**
- `rms` → ring breathing, saturation, brightness, radius pulse
- `centroid` → base hue
- `onset` → centre flash + outward bell-ring burst, rotation kick

**MIDI CCs:** cc16 ring count, cc17 hue shift, cc18 symmetry N
(6–16), cc19 rotation speed, cc20 star skip k (in {N/k}), cc21 trail
amount, cc22 extra rotation spin, cc23 scale multiplier (knob at zero
leaves scale alone), cc25 brightness.

**No panel-tunables.** Scale auto-fits to body size; tuning constants
(`N_MIN`, `N_MAX`, anchor `3.5×` shoulder factor) live in the file.

---

## Adding a new scene

1. Pick a renderer subdirectory (`hydra/`, `three/`, `p5/`). Each has
   its own `*Scene` interface in `types.ts`.
2. Create a scene file exporting a class implementing that interface.
3. Register it in the renderer's constructor `sceneMap`.
4. If it introduces uncertain tuning constants, add them to
   `settings.ts` under "Scene tuning" and read from `config.*` in the
   scene's tick.
5. Document here.
