---
name: threejs-film
description: Make a 3D animated video from a description. Builds a single-file three.js film (frame-exact, every frame a pure function of time), grades and checks it frame by frame, synthesizes its score and sound effects in code with the Web Audio API, masters to -14 LUFS, and renders a 60 fps MP4 with the audio muxed in. Use this whenever the user describes a 3D animation, an animated loop, a character or mascot animation, a toy, miniature or diorama scene, a product turntable, animation principles, or says things like "make a video where...", "animate a little scene of...", "3D loop", "render this as an MP4", even when they never say three.js. Not for 2D product reels built from real screenshots of a product (use motion-reel for those).
---

# threejs-film

You turn a described scene into a finished film: one HTML file where `window.renderAt(t)` paints any frame
from `t` alone, a mastered WAV synthesized by the same page, and an MP4. The engine (renderer, post grade,
checks, audio engine, mastering) ships in `assets/template.html`; your job is the film: the beat sheet,
the scene, the motion, the look and the score.

`<skill>` below is this skill's folder. All tooling is one script: `node <skill>/scripts/film.mjs <cmd> <dir>`.
Put films in `outputs/<slug>/` unless the user names a folder.

## 1. Setup

Run `node <skill>/scripts/film.mjs doctor`. It needs node 18+, Playwright with Chromium, ffmpeg/ffprobe,
python3 with numpy and Pillow, and reach to cdn.jsdelivr.net and Google Fonts. WebGL runs on SwiftShader in
headless Chromium, so expect roughly 0.3–0.5 rendered frames per second at 1080p on 4 cores. An 8 s, 60 fps
film is about 16 minutes to render; say so before the final render.

## 2. Brief

Pull everything you can from the description first. Then ask once, in a single AskUserQuestion round with
your recommended option first, only for what is missing and would change the film:

- format: 1080x1080 (default), 1920x1080, 1080x1920
- duration and whether it loops (default 8 s, seamless loop, 60 fps)
- sound: synthesized score + SFX (default), SFX only, silent
- look: palette and type if they have a brand (default: warm studio, Geist Mono for any on-screen type)

A detailed brief (frames, colours, lights, camera) needs no questions. Treat its numbers as the spec:
exact frames, exact hex values, exact angles. When a number cannot be met as written (say a light placed
where it would wash out the set), meet the intent, and list it as a judgment call at delivery.

## 3. Beat sheet, then stop

Write `<dir>/BEATS.md` from `references/beat-sheet.md`: the timeline in frames (every visual event and the
sound that lands on it), the set and props, materials and colours, lights with temperatures and angles,
camera moves, on-screen type, post, keep-out zones and colour targets. Show it and wait for the user's OK.
A table is cheap to change and a 16-minute render is not. If the user has already approved the plan, or
said to go straight through, carry on.

## 4. Build

1. `node <skill>/scripts/film.mjs new <dir> --title "Name" --w 1080 --h 1080 --fps 60 --seconds 8` (add
   `--no-loop` for a one-shot). This copies the template with a working demo scene so the pipeline renders
   immediately.
2. Read `references/engine.md` for the template's anatomy and APIs, then replace the SCENE sections
   (scene, `update(f)`, `focusPoint()`, overlay, CHECK registrations, `scoreLoop`) with the beat sheet.
   Keep the engine and the `window.*` contract.
3. Read `references/craft.md` before lighting and animating. It holds the lessons that decide whether the
   film reads: how to make a brand colour read exactly, why the key is a distant spot, how to keep clicks
   visible, how to build anticipation, squash, overlap and arcs as pure functions, and how to keep the loop
   seamless.

Rules that keep frames correct when they render out of order across parallel pages:
- Everything is a function of the frame number `f`. No `Math.random` (use `mulberry32`), no
  `performance.now`, no state carried between frames. Motion with history (limbs, follow cameras) is
  simulated once at load with `accelSpring` / `followTable` and read back with `tab()`.
- All event frames live in one constant (`T`), and the score cues the same constants.
- Light count and `castShadow` never change at runtime; turn lights off with `intensity = 0`.
- Loops wrap time (`wrap(f)`), and anything late in the loop that spills past the end (sparks, springs,
  ripples) adds the loop duration to negative ages so it continues at the start.

## 5. Look development: three rounds minimum

Each round:
- `film.mjs sheet <dir> <name> <frames>` across every beat (lights, each action, the end and frame 0), plus
  `--crop hero` sheets on the hero for motion detail. Look at every sheet.
- `python3 <skill>/scripts/measure.py <dir>/out/stills` to read the graded colour at each CHECK probe
  against its target. Calibrate light levels and the grade until targets land within about 5 levels per
  channel.
- `film.mjs check <dir>` over the whole film: props against keep-out rects (on-screen type) and the frame
  edge.
- Score 1–10: hook (frame 0 and the first second), readability of type at phone size, motion (anticipation,
  squash and stretch, overlap, arcs, settle), look (colour targets, lights read when they click, contrast),
  framing (keep-outs, nothing important cropped), sync. Write the worst three problems and fix them.
  Stop when every score is 8 or higher and three rounds are done. Log rounds in `<dir>/CRITIQUE.md`.

## 6. Score

Read `references/sound.md`. Write `scoreLoop` with the instrument library: a bed (pads that follow their
lights, kick and bass on the grid) and SFX on every visual event. Every hit lands one frame after its
visual event (the engine's `AT(f)` does this), and every hit gets a `cue()` so it can be checked.

- `film.mjs stems <dir>`: balance groups before mastering (raw mix near -17 to -18 LUFS, no group running
  away).
- `film.mjs audio <dir>`: masters to -14 LUFS / -1.4 dBTP, writes `out/score.wav` and runs the onset sync
  check.
- You cannot listen. Check the spectrum (`ffmpeg -i out/score.wav -lavfi showspectrumpic=s=1600x500:scale=log out/spectrum.png`)
  and the stems, and tell the user the audio was checked by measurement only.

## 7. Render, encode, verify

Start `film.mjs frames <dir> --workers 3` in the background and watch its progress with a monitor, not
sleeps. Then `film.mjs encode <dir>`. It writes the CRF 14 master, a smaller preview when the master is over
28 MB (chat uploads cap near 30 MB), a contact sheet, and runs `verify.py`. Every line must PASS:
resolution, fps and frame count, yuv420p, 48 kHz stereo audio, -14 ±0.5 LUFS, true peak ≤ -1.0 dBTP, frame
N identical to frame 0 for loops, no `Math.random`.

## 8. Deliver

Send the MP4 (the preview if the master is too big, and say where the master is), `index.html`, the WAV and
the contact sheet. Then give, briefly:
- what was measured: colour targets vs result, loudness, true peak, loop seam, sync
- judgment calls: every place you interpreted or departed from the brief, numbered, one line each
- the one-line re-render command

Re-rendering after a change is `film.mjs frames`, then `audio` (when the score changed), then `encode`.
