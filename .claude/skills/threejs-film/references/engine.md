# Engine: what the template gives you

`assets/template.html` is one module script in sections. Replace the SCENE parts; keep the rest.

## Contract (the tools depend on it)

| global | what it is |
|---|---|
| `window.FILM` | `{ title, W, H, FPS, SECONDS, LOOP, frames, duration }` |
| `window.renderAt(t)` | paints frame `round(t * FPS)`; returns the frame. Pure function of `t`. |
| `window.frameCheck(t)` | updates to `t` and returns `{ f, props: {name: rect}, keepOut: [rect], probes: {name: [x, y]}, notes }` |
| `window.renderAudio(opts)` | offline score. `{}` -> mastered `{ wav (base64), stats, events }`; `{ solo: [group] }` / `{ raw: true }` -> unmastered stats; `{ asBuffer: true }` -> AudioBuffer for live play |
| `window.AUDIO_GROUPS` | group names for `film.mjs stems` |
| `window.filmReady` | set after fonts load and shaders compile |

Opening the file normally plays it live (click to hear the score). `?render=1` sizes the canvas to exactly
W x H for capture.

## Sections

1. **FILM**: `W, H, FPS, SECONDS, LOOP`. `N` frames, `DUR` seconds. `wrap(f)` loops or clamps.
2. **math**: `clamp, lerp, sstep, ease*`, `mulberry32(seed)`, `springStep(tau, zeta, hz)` (damped release
   from 1 to 0 with zero start velocity), `keys([[frame, value], ...], f, ease)`.
3. **tables**: `accelSpring(signal, { hz, zeta, gain, lag })` drives a damped spring with the second
   derivative of `signal(f)` delayed `lag` frames, simulated three passes so the table is the loop's steady
   state. Use it for limbs, ears, antennae, cables, anything that should trail and settle.
   `followTable(target, hz)` is a critically damped follower (camera tracking). Read both with `tab(arr, f)`.
4. **kelvin(K, strength)**: colour temperature as linear RGB at unit luminance, tempered toward white.
   **lightLevel(onFrame, f, offFrame)**: 0 before, the 3-frame `FLICKER` on the click, 1 after, 0 from off.
5. **renderer**: no tone mapping (the final pass grades), PCF shadows with `autoUpdate = false` (the frame
   loop renders shadows once per frame), `MAX_ANISO` for printed textures.
6. **overlay**: a 2D canvas composited after the grade. Draw with `setOverlay(key, (ctx) => ...)`; the key
   is any string that changes only when the drawing should, so unchanged frames skip the upload.
7. **post**: scene into a 4x MSAA half-float target, a depth pre-pass, then
   - DOF (`dofMat.uniforms`: `focus` set each frame from `focusPoint()`, `cocK` strength (circle of
     confusion in pixels per unit of |1/focus - 1/z|), `maxCoc` 9 px). Scale `cocK` with the scene:
     about 400 for a 13-unit camera, 1600-2200 for 40 units.
   - bloom: max-channel threshold `thr` 1.3 (only emissives above white bloom), `bloom` strength 0.55.
   - grade (`finalMat.uniforms`): `wb` white balance gains, `shoulder` 0.84 (hue-preserving roll-off, so a
     saturated emissive at intensity 3 still reads its exact hex), `vignette` 0.10, `grain` 0.02, plus
     1-LSB TPDF dither.
8. **makeBackdrop({ y, shadowCenter, shadowHalf, shadowRound, shadowDark, shadowSoft })**: an unlit floor
   whose colour you set per frame from the light levels, with a radial falloff and a soft rounded-rect
   shadow under whatever floats above it. Offset the shadow toward the camera so the visible part reads.
9. **checks**: `CHECK.props.name = object3D` (bounding rect tracked per frame), `CHECK.keepOut.push({ name,
   x0, y0, x1, y1 })` (pixels), `CHECK.probes.name = (f) => Vector3` (world point to colour-sample),
   `CHECK.notes.<probe>Target = '#RRGGBB'`.
10. **SCENE**: palette, timeline `T`, `LEVELS`, materials, set, hero, `body(f)`, tables, lights, `cameraAt`,
    overlay drawing, CHECK registrations, `update(f)`, `focusPoint()`.
11. **SCORE (scene)**: `AUDIO = { bpm, lufs, ceilingDbtp, groups }` and `scoreLoop({ cue, on, I })`.
12. **audio engine**: `AT(f) = (f + 1) / FPS`, instrument library, mastering, WAV writer, `renderAudio`.
13. **frame**: `renderFrame(f)` runs the passes; `frameOf(t)` quantizes time so float error never shifts a
    frame boundary.

## Instrument library (`I` inside scoreLoop)

All times are frames of visual events; each voice lands at `AT(frame)`. Pan is -1..1.

| call | sound |
|---|---|
| `pad(midi, onF, offF, pan, level)` | detuned saw/triangle pad that follows the light's flicker and snaps off |
| `kick(f, v)` / `bass(f, midi, frames, v)` / `shaker(f, v, pan)` | the groove |
| `click(f, pan, off)` | light switch; `off = true` is the heavier clunk |
| `creak(fromF, toF, pan)` + `riser(fromF, toF, pan)` | anticipation: stick-slip creak and an inhale riser up to takeoff |
| `swish(f, pan, level, topHz)` | upward swish for a takeoff or fast move |
| `squash(f, pan, baseHz, syOf, level, dur)` | rubber landing whose pitch follows the visual squash curve `syOf(frame)`, plus thump and squish |
| `ting(f, delay, midi, pan, level)` | FM bell (sparks, sparkle); pan it by the spark's direction |
| `ping(f, midi, pan, level)` | soft sine bell for UI or labels; pick notes in the key |
| `tick(f, hz, pan, level)` | tiny click (dots drawing in, counters) |
| `whoosh(fromF, toF, { ampAt, panAt, freqAt })` | long whoosh shaped over 0..1 (flip, fly-through); pan from the hero's x |
| `blip(f, pan, level)` | blink or small UI blip |

Add instruments inside `instruments()` when the film needs one; keep them deterministic (`r()` is the
seeded generator, identical for every pass).

## film.mjs

| command | does |
|---|---|
| `new <dir> --title --w --h --fps --seconds [--no-loop]` | scaffold from the template |
| `doctor` | toolchain check |
| `stills <dir> 0,60,120` | PNG + frameCheck JSON per frame in `out/stills/` |
| `sheet <dir> <name> <frames> [--crop <prop or probe> --size px]` | render and tile, frame numbers on tiles |
| `check <dir> [--step 2]` | keep-out overlaps and props leaving the frame across the film |
| `audio <dir>` / `stems <dir>` | mastered score + sync report / per-group levels |
| `frames <dir> [--workers 3]` | all frames (plus frame N for the loop seam) |
| `encode <dir> [--name]` | master MP4, preview if > 28 MB, contact sheet, verify |

`measure.py <dir>/out/stills` samples probe colours. `sync.py` and `verify.py` run inside `audio` and `encode`.

## Worked example

`references/example-principles-loop.html` is a complete 8 s film made with this engine's first version:
a floating slab studio with three light rigs on stands, a voxel mascot that hops four keyframe diamonds
and flips back along a dotted arc, a checklist overlay, a playhead, cell ripples and sparks. Read it for
patterns (multi-jump `body()`, eye-glance keys, light rigs and their props, ripples, the arc, a full
score). Its tooling calls differ (it predates `film.mjs`), so scaffold new films from the template.
