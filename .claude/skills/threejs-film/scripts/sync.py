#!/usr/bin/env python3
"""Onset check: every cue() event should have an audio onset at its frame + 1 (one frame after the picture).
Reports the offset per event. Events closer together than ~25 ms blur into one onset; read those as a group.

  sync.py <score.wav> <audio.json>
"""
import json, sys, wave
import numpy as np
w = wave.open(sys.argv[1]); n = w.getnframes(); sr = w.getframerate()
a = np.frombuffer(w.readframes(n), dtype=np.uint8).reshape(-1, 3)
v = (a[:, 0].astype(np.int32) | (a[:, 1].astype(np.int32) << 8) | (a[:, 2].astype(np.int32) << 16))
x = (np.where(v >= 1 << 23, v - (1 << 24), v) / 8388607).reshape(-1, 2).mean(axis=1)
events = json.load(open(sys.argv[2]))['events']
hop, win = 96, 1024
xx = np.concatenate([x[-win:], x, x[:win]])
frames = np.lib.stride_tricks.sliding_window_view(xx, win)[::hop] * np.hanning(win)
S = np.log1p(30 * np.abs(np.fft.rfft(frames, axis=1)))
flux = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
t_axis = (np.arange(len(flux)) + 1) * hop / sr - win / sr + win / 2 / sr
offs = []
for e in events:
    m = (t_axis > e['t'] - 0.03) & (t_axis < e['t'] + 0.03); idx = np.where(m)[0]
    if not len(idx): continue
    j = idx[np.argmax(flux[idx])]; off = (t_axis[j] - e['t']) * 1000; offs.append(off)
    print(f"  f{e['frame']:>4} {e['label']:<18} onset {off:+5.0f} ms")
if offs:
    o = np.abs(np.array(offs)); print(f'sync: {len(offs)} events, median |offset| {np.median(o):.1f} ms, max {o.max():.1f} ms (detector bias ~ -5 ms)')
