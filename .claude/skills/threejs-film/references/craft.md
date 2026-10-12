# Craft: what makes these films read

Each of these lessons came from a real problem in a frame-checked film. They explain why the template
works the way it does, so apply the reasoning rather than copying the numbers.

## Colour and light

**Calibrate by measurement, not by eye.** The grade is linear with a hue-preserving shoulder and no tone
curve, so a surface lit to unit irradiance shows exactly its albedo. When the brief says "the lit front face
reads #D97757", add a probe on that face (`CHECK.probes`, `CHECK.notes.<name>Target`), render a rest frame
with every light on, run `measure.py`, and move the key intensity until the face lands within about 5
levels per channel. Then check the white surfaces haven't clipped and the backdrop still separates.

**Make the key a distant, non-decaying spot along a fixed direction** (`decay 0`, about 30 units out,
narrow cone that just covers the set). A key placed physically on a stand near the set changes the hero's
brightness two to three times as it crosses the stage, so no single exposure hits a colour target. A
distant key keeps the face constant everywhere and still gives a soft falloff and real soft shadows. The
stand and softbox are props: put them where the brief says, aim them along the light, and set
`castShadow = false` on any prop that sits on the light's axis.

**Elevation sets the face-to-top ratio.** Lit by the key, a front face gets `cos(el)·cos(az)` and a top
face gets `sin(el)`. At 28° elevation and 40° azimuth the front gets 1.4 times the top, which lets a coloured
front read its albedo while a white top sits just below clipping. A high key does the opposite: tops blow
out before fronts read.

**Never light a coloured surface with a light of the same colour if it must read an exact hex.** The colour
multiplies by itself (orange light on orange albedo turns red). For lit-up parts (keyframe diamonds, LEDs),
set the albedo near black and let the emissive carry the colour at intensity 2–4. The shoulder keeps the
hue, so they read the exact hex and still bloom.

**Grade the backdrop; don't light it.** A floor lit by the key shows its cone edges as diagonal streaks, and
a uniformly lit floor washes out to the same brightness as a white set, which is the "washed out" look. The
template's unlit backdrop takes its level from the light levels each frame. That puts lights-off near 50%
grey, adds a step per light so every click reads across the whole frame, and draws a soft shadow under
floating things, offset toward the camera so you can see it.

**Keep the fill low so clicks read.** With hemisphere fill alone, a white surface at about 0.2 linear reads
near 50%. Each light adds a little ambient "bounce" in its own colour temperature, and the panel or lens of
its practical prop turns emissive. A panel the camera can see (turn it toward the lens) or a glowing lens
rim is what makes a click visible.

**Temper colour temperatures.** Full-strength 3200 K turns everything orange and 7500 K turns it blue.
`kelvin(K, 0.3–0.8)` keeps the temperature readable as warm vs cool without tinting whites pink. If whites
drift, fix the tint strength first and use the `wb` gains last.

**Bloom only what glows.** The prefilter thresholds at 1.3 on the brightest channel, above lit white (≤ 1.0),
so emissives bloom and the set stays crisp. An overexposed set blooms everywhere and looks hazy.

**Keep the light set fixed.** The number of lights and their `castShadow` flags compile into the shaders. To
turn a light off, set `intensity = 0`; adding or removing lights mid-film forces a recompile and stutters.

**Rim from low and behind.** A rim at 10–15° elevation from the back corner edges the side faces the camera
can see without washing the top of the set. A high rim mostly lights the floor.

## Motion

**Write a pure `body(f)`.** Find the active jump from the timeline, then return `{ x, lift, sx, sy, rot,
lean }`:
- anticipation: ease `sy` down to the crouch over the crouch frames (`sstep`)
- snap from the crouch into the stretch over the last 2 frames, peaking on the takeoff frame
- air: a parabola for lift with constant horizontal speed, which gives a true arc. Relax the stretch over
  the first 45% of the air, then add a slight pre-landing stretch (1.06–1.08)
- the landing frame is the squash peak; after it,
  `sy = 1 + (squashY - 1) * springStep(tau, 0.55, 3.2)`
- derive `sx` from `sy` with a linear map through the target pairs (crouch 1.2x0.75, stretch 0.85x1.28,
  squash 1.25x0.7), so the keyframe values come out exact
- squash about the feet (a group whose origin is at the feet), and rotate flips about the centre of mass
  (the parent group)

**Overlap and follow-through come from lagged acceleration.** Limbs that trail are an `accelSpring` driven by
the body's vertical acceleration at the attach point, delayed by the lag frames the brief asks for. In free
fall they rise; on takeoff and landing they droop, then settle. For a settle the audience can see, use about
2.2 Hz and damping 0.22. Clamp the angle so a big impulse cannot fold a limb through the body.

**Glances need the body.** At a wide shot, eyes moving a voxel are 3 pixels. Turn the whole body 8–12° toward
the look (`rig.rotation.y = gaze * 0.17`) and move the eyes as well. Ease between gaze keys with `keys()`.

**Particles must be seen immediately.** Spawn sparks outside the hero's footprint, with enough upward
velocity to clear it in the first frames. Make them at least 0.07 units at a 40-unit camera distance, and
emissive with a fade over their life. Seed each set and reuse the same seed in the score, so each spark's
ting pans with its direction.

**Loops are a function of `wrap(f)`.** Anything that starts late and runs past the end (sparks, ripples,
springs) computes its age as `f - start`, plus the loop duration when negative. Camera orbits use `sin`
over the whole loop. The last beat must return everything to frame 0's state, and `verify.py` proves it with
frame N against frame 0.

## Camera and framing

- A narrow lens (FOV 18–24°) from 25–35° elevation reads as a miniature.
- Pushes that track a moving hero should follow only part of its lateral position (about 45%), scaled by the
  push amount, so the wide shots stay centred and the push shows where the action is.
- On-screen type gets a keep-out rect (`CHECK.keepOut`). Tall props at the back of a set rise into the top of
  the frame, so run `film.mjs check` over every frame and lower or move props until nothing overlaps.
- In wide shots everything the brief lists must be inside the frame. `check` reports props that leave it.
- A punch-in on an impact (3–5% over 3 frames, decaying over 0.3 s) sells weight without a cut.

## Post

- DOF scales with the scene: set `cocK` so the far edges of the set blur 2–4 px and the backdrop 6–9 px, and
  keep the subject sharp. Over-blur makes a miniature look like a toy photo and hides the motion.
- The final pass dithers everything with 1-LSB TPDF noise. Without dither, smooth backdrops band in 8-bit
  H.264.
- Grain at 2% is visible at full size and gone at phone size. It costs bitrate: the CRF 14 master of an 8 s
  1080p film runs about 35 MB, so `encode` also writes a CRF 17 preview.
