# Beat sheet template

Save as `<dir>/BEATS.md`. Frames are the unit; seconds are for the reader. Fill every row the film needs and
delete the rest. Keep it to one screen where possible; it is what the user signs off.

```markdown
# <Title>: beat sheet

Format: 1080x1080, 60 fps, 8 s (480 frames), seamless loop (frame 480 == frame 0)
Sound: synthesized score + SFX, 120 BPM, F major, -14 LUFS / -1 dBTP, hits land 1 frame after picture

## Set
- Stage: floating white 12x6 slab, top at y=0, 2 units above an F4F2EE backdrop (graded, soft shadow)
- Hero: <what it is, size in world units, materials: colour, roughness, clearcoat>
- Props: <each prop, where it stands, what it does>
- On-screen type: <font, size, colour, position, what it says, when it changes>

## Look
- Key: <temp K, direction (elevation, azimuth from camera axis), soft shadows?>
- Rim / fill / practicals: <temp, direction, what they light>
- Lights-off level: <e.g. frame near 50% grey>
- Colour targets: <surface -> hex it must read, e.g. hero lit front face -> #D97757>
- Post: bloom on emissives, DOF on <subject>, grain <n>%, vignette <n>%

## Camera
- Lens: FOV <deg>, <elevation> deg, base distance <units>
- Moves: <orbit / push-in / tracking / punch-in, with frames>
- Keep-outs: <screen regions nothing may enter, e.g. the label block top-left>

## Timeline
| frame | s | picture | camera | light | sound (lands frame+1) | type |
|------:|--:|---------|--------|-------|-----------------------|------|
| 0 | 0.00 | lights off, hero at rest on A | wide | all off | silence | rows grey |
| 6 | 0.10 | key clicks on (3-frame flicker), hero glances at it | | key on | click, pad A3+E4 swells | |
| ... | | | | | | |
| 468 | 7.80 | lights, diamonds, labels snap off | | all off | off click | rows grey |

## Checks
- Probes: <world point -> target hex> (measure.py)
- Keep-outs: <rect name -> pixels> (film.mjs check)
- Loop seam: frame N == frame 0
```

Notes for writing it:
- Put every visual event on a frame, and give each one its sound in the same row. The score is written
  from this table, so a missing sound here is a missing sound in the film.
- Motion beats need their timing: crouch length, air frames, squash amounts, settle (spring frequency and
  damping). Defaults that read well: crouch 10–12 frames, takeoff stretch peaking on the takeoff frame,
  20–30 air frames for a small hop, squash on the landing frame, spring back at damping 0.5–0.6.
- Something should change on screen every one to two seconds in a short loop.
- For a loop, write how the last beat hands back to frame 0 (lights snap off, hero back at the start pose,
  camera back to its start).
