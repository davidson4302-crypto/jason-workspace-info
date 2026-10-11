#!/usr/bin/env python3
"""Grade eval runs for threejs-film. Works on any output (with or without the skill): it inspects the MP4,
the HTML source and the notes the run left behind.

  grade.py <iteration-dir>          writes <eval>/<config>/run-1/grading.json for every run
"""
import glob, json, os, re, subprocess, sys
import numpy as np

SPEC = {
    'frog-hop-loop': {'w': 1080, 'h': 1080, 'secs': 4, 'loop': True},
    'speaker-hero-oneshot': {'w': 1920, 'h': 1080, 'secs': 5, 'loop': False, 'teal': (0x14, 0xB8, 0xA6)},
    'blocks-follow-through-vertical': {'w': 1080, 'h': 1920, 'secs': 4, 'loop': True},
}

def run(cmd): return subprocess.run(cmd, capture_output=True, text=True)

def frames_of(mp4, w, h, idx):
    """Decode selected frame indices as uint8 arrays (scaled to 1/4 for speed)."""
    out = []
    for i in idx:
        r = subprocess.run(['ffmpeg', '-v', 'error', '-i', mp4, '-vf', f"select=eq(n\\,{i}),scale={w // 4}:{h // 4}", '-vsync', '0', '-frames:v', '1',
                            '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True)
        out.append(np.frombuffer(r.stdout, np.uint8).reshape(h // 4, w // 4, 3).astype(int) if len(r.stdout) == (w // 4) * (h // 4) * 3 else None)
    return out

def grade(run_dir, name):
    spec = SPEC[name]; out = os.path.join(run_dir, 'outputs'); ex = []
    def add(text, ok, ev): ex.append({'text': text, 'passed': bool(ok), 'evidence': ev})
    mp4s = [p for p in glob.glob(os.path.join(out, '**/*.mp4'), recursive=True) if 'preview' not in os.path.basename(p)]
    mp4s.sort(key=os.path.getsize, reverse=True)
    mp4 = mp4s[0] if mp4s else None
    add('An MP4 was delivered', mp4, mp4 or 'no .mp4 under outputs/')
    v = a = None
    if mp4:
        st = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', mp4]).stdout or '{"streams":[]}')['streams']
        v = next((s for s in st if s['codec_type'] == 'video'), None); a = next((s for s in st if s['codec_type'] == 'audio'), None)
    want_n = spec['secs'] * 60
    add(f"Resolution is {spec['w']}x{spec['h']}", v and v['width'] == spec['w'] and v['height'] == spec['h'], f"{v and v['width']}x{v and v['height']}")
    nb = int(v.get('nb_frames', 0)) if v else 0
    add(f'60 fps and {spec["secs"]} s ({want_n} frames, +-1)', v and v['r_frame_rate'] == '60/1' and abs(nb - want_n) <= 1, f"{v and v['r_frame_rate']}, {nb} frames")
    add('Audio is muxed in: 48 kHz stereo', a and int(a['sample_rate']) == 48000 and a['channels'] == 2, f"{a and a['codec_name']} {a and a['sample_rate']} Hz x{a and a['channels']}" if a else 'no audio stream')
    I = TP = None
    if a:
        s = run(['ffmpeg', '-hide_banner', '-nostats', '-i', mp4, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr
        s = s[s.rfind('Summary:'):]
        mI = re.search(r'I:\s+(-?[\d.]+) LUFS', s); mT = re.search(r'Peak:\s+(-?[\d.]+|-inf) dBFS', s)
        I = float(mI.group(1)) if mI else None; TP = float(mT.group(1)) if mT and mT.group(1) != '-inf' else None
    add('Integrated loudness is -14 LUFS (+-1)', I is not None and abs(I + 14) <= 1, f'{I} LUFS')
    add('True peak is at or below -1.0 dBTP', TP is not None and TP <= -1.0, f'{TP} dBTP')
    htmls = [p for p in glob.glob(os.path.join(out, '**/*.html'), recursive=True) if 'review' not in p]
    src = next((p for p in htmls if 'three' in open(p, errors='ignore').read()), None)
    add('A single-file three.js HTML source was delivered', src, src or f'html files: {htmls}')
    if src:
        h = open(src, errors='ignore').read()
        add('Randomness is seeded (no Math.random in the source)', 'Math.random' not in h, 'Math.random found' if 'Math.random' in h else 'none found')
    else:
        add('Randomness is seeded (no Math.random in the source)', False, 'no source')
    mds = [p for p in glob.glob(os.path.join(out, '**/*.md'), recursive=True) if os.path.basename(p).lower() not in ('notes.md', 'critique.md', 'readme.md')]
    plan = next((p for p in mds if re.search(r'\bframe', open(p, errors='ignore').read(), re.I)), None)
    add('A frame-level plan (beat sheet) was written', plan, plan or f'md files: {[os.path.basename(m) for m in mds]}')
    notes = next(iter(glob.glob(os.path.join(out, '**/notes.md'), recursive=True)), None)
    nt = open(notes, errors='ignore').read() if notes else ''
    add('Notes report measurements and judgment calls', notes and re.search(r'LUFS', nt) and re.search(r'judg', nt, re.I), notes or 'no notes.md')
    if mp4 and v:
        w, hh = v['width'], v['height']
        if spec['loop']:
            n = nb
            fr = frames_of(mp4, w, hh, [0, 1, n // 2, n // 2 + 1, n - 2, n - 1])
            if all(x is not None for x in fr):
                d = lambda p, q: float(np.abs(p - q).mean())
                seam = d(fr[5], fr[0]); typical = max(d(fr[0], fr[1]), d(fr[2], fr[3]), d(fr[4], fr[5]))
                add('Loop seam: the last frame flows into the first like any other step', seam <= typical * 2 + 1.5, f'last->first {seam:.2f} vs largest neighbour step {typical:.2f} (mean abs level)')
            else: add('Loop seam: the last frame flows into the first like any other step', False, 'could not decode frames')
        if 'teal' in spec:
            fr = frames_of(mp4, w, hh, [nb - 2])[0]
            if fr is not None:
                t = np.array(spec['teal']); close = (np.abs(fr - t) <= 14).all(axis=2).sum()
                add('Brand teal #14B8A6 reads on the ring in the final frame (>= 40 px at 1/4 scale within 14 levels)', close >= 40, f'{close} matching pixels at 1/4 scale')
            else: add('Brand teal #14B8A6 reads on the ring in the final frame (>= 40 px at 1/4 scale within 14 levels)', False, 'could not decode')
    p = sum(e['passed'] for e in ex)
    return {'expectations': ex, 'summary': {'passed': p, 'failed': len(ex) - p, 'total': len(ex), 'pass_rate': round(p / len(ex), 3)}}

if __name__ == '__main__':
    it = sys.argv[1]
    for ed in sorted(glob.glob(os.path.join(it, 'eval-*'))):
        name = os.path.basename(ed)[5:]
        for cfg in ('with_skill', 'without_skill'):
            rd = os.path.join(ed, cfg, 'run-1')
            if not os.path.isdir(os.path.join(rd, 'outputs')): continue
            g = grade(rd, name)
            json.dump(g, open(os.path.join(rd, 'grading.json'), 'w'), indent=1)
            print(f"{name:34s} {cfg:14s} {g['summary']['passed']}/{g['summary']['total']}")
