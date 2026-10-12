# Onset check: every scored event should have an audio onset 1 frame (16.7 ms) after its visual frame.
import numpy as np, wave, sys
def load(p):
    w = wave.open(p); n = w.getnframes(); sr = w.getframerate(); a = np.frombuffer(w.readframes(n), dtype=np.uint8).reshape(-1, 3)
    v = (a[:,0].astype(np.int32) | (a[:,1].astype(np.int32) << 8) | (a[:,2].astype(np.int32) << 16)); v = np.where(v >= 1<<23, v - (1<<24), v) / 8388607
    return v.reshape(-1, 2).mean(axis=1), sr
x, sr = load(sys.argv[1] if len(sys.argv) > 1 else 'out/score.wav')
hop, win = 96, 1024                                  # 2 ms hop
xx = np.concatenate([x[-win:], x, x[:win]])          # cyclic
frames = np.lib.stride_tricks.sliding_window_view(xx, win)[::hop] * np.hanning(win)
S = np.log1p(30 * np.abs(np.fft.rfft(frames, axis=1)))
flux = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
t_axis = (np.arange(len(flux)) + 1) * hop / sr - win / sr + win / 2 / sr
events = {'click': [6, 24, 42, 468], 'crouch': [69, 129, 189, 249, 312], 'takeoff': [80, 140, 200, 260, 330],
          'landing': [105, 165, 225, 285, 384], 'ping': [69, 140, 200, 285, 303], 'tick': list(range(303, 319)), 'blink': [432]}
thr = np.percentile(flux, 75)
offs = []
for k, fr in events.items():
    row = []
    for f in fr:
        target = (f + 1) / 60
        m = (t_axis > target - 0.03) & (t_axis < target + 0.03)
        idx = np.where(m)[0]; j = idx[np.argmax(flux[idx])]
        off = (t_axis[j] - target) * 1000; row.append(f'{f}:{off:+.0f}ms'); offs.append(off)
    print(f'{k:8s}', ' '.join(row))
offs = np.array(offs); print(f'events {len(offs)}, |offset| median {np.median(np.abs(offs)):.1f} ms, max {np.abs(offs).max():.1f} ms (onset vs frame+1)')
