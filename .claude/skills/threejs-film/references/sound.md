# Sound: scoring a film in code

## Timing

- Every hit lands one frame after its visual event. `AT(f) = (f + 1) / FPS` does it for every instrument,
  the music grid included, so the whole score sits one frame behind the picture, which is how sync
  reads to a viewer.
- Cue every hit you mean to be heard (`cue(frame, label)`). `film.mjs audio` checks each cue for an onset.
  The detector has about 5 ms of bias. Cues closer together than about 25 ms blur into one onset, so read
  those as a group.
- Write the score from the beat sheet's sound column, so each row there becomes a line in `scoreLoop`.

## Seamless loops

`renderAudio` plays `scoreLoop` three times, with the same seeded choices each pass, and keeps the middle
pass. Tails from the end of the loop (reverb, a shaker on the last eighth, a pad release) are already
present at the start, so the file loops with no click. Mastering runs cyclically for the same reason.
One-shot films render once and fade out over the last 50 ms.

## A score that supports the picture

- **Bed:** pads that follow their lights (the voice swells with the light's flicker and snaps off with it),
  kick and bass on the grid, shaker eighths. Pick notes from the key. For example, in F major the voices
  A3, E4, C5 and G5 over roots F, D, Bb and F give a warm Fmaj9 colour.
- **Rests are punctuation.** Drop the kick and shaker under a big move (a flip, a fall). Hold the bass on
  the dominant through it and resolve to the root on the landing.
- **Action SFX:** a creak plus an inhale riser for anticipation, a swish for takeoff, and a rubber squash
  for landings. Make the squash's pitch follow the visual squash curve (pass `(f) => body(f).sy`), so
  the sound bounces with the spring. Add a ting per spark, panned by its direction, a ping per label in
  the key, ticks for things drawing in, a whoosh shaped by the hero's position for long moves, and a blip
  for a blink.
- **Pan by screen position:** `PAN(x) = clamp(x / halfStageWidth, -0.75, 0.75)`. A hero hopping left to
  right should travel left to right in the stereo field.
- **The biggest beat gets the most weight:** a lower base pitch, a longer thump, more tings and the
  deepest limiting headroom.

## Levels and mastering

1. `film.mjs stems <dir>`: raw loudness and true peak per group. Aim for a raw mix near -17 to -18 LUFS
   with the kick around -19, the bed around -26 to -30, and SFX groups between -22 and -35 depending on
   how rare they are. If one group's true peak is near 0 dB on its own, that group is too hot.
2. `film.mjs audio <dir>`: gain to -14 LUFS (BS.1770), a cyclic 4x-oversampled true-peak limiter at
   -1.4 dBTP, iterated until within 0.05 LU. More than about 4 dB of gain reduction means a transient is
   too loud for the mix, so pull it down at the source instead.
3. AAC encoding adds 0.1-0.3 dB of peak, which is why the ceiling is -1.4 for a -1.0 spec. `verify.py`
   measures the muxed audio.

## Pitfalls already paid for

- **Reverb:** a convolution IR built from decaying noise must be normalized to unit energy. Unnormalized,
  it amplified the reverb send by about 20 dB, pushed a landing to +5 dBTP and buried the mix. Also
  high-pass the reverb send (about 280 Hz) so kicks and thumps don't muddy the room.
- **Seeding:** reset the RNG per pass (the engine does), or the middle pass's tails won't match its own
  end and the loop will tick.
- **Envelopes:** call `gain(0, ...)` before an envelope. An AudioParam holds its initial value until its
  first automation event, so a gain created at 1 sounds from time 0.
- **Listening:** you cannot listen, so verify with the stems, the spectrum and the sync report, and tell
  the user plainly that a human ear should check the mix.
