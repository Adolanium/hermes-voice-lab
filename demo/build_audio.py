"""Build the demo film's soundtrack from film/film.json: the app takes' own
voice, the act (voice + band), and the band under the app scenes.

usage: python demo/build_audio.py  (paths are relative to demo/)
Needs demo/out/timeline.json, demo/out/act-voice.wav and the two takes in film/assets.
Writes film/assets/soundtrack.wav (48 kHz stereo, peak −1 dBFS).
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.io import wavfile

import sys
sys.path.insert(0, str(Path(__file__).parent))
import music as M  # noqa: E402

HERE = Path(__file__).parent
SR = M.SR
F = json.load(open(HERE / 'film/film.json'))
TL = json.load(open(HERE / 'out/timeline.json'))


def load(path, tempo=1.0, start=None, end=None):
    """Decode audio (any container) to float stereo at SR, optionally a span and a tempo change."""
    cmd = ['ffmpeg', '-loglevel', 'error']
    if start is not None:
        cmd += ['-ss', f'{start:.3f}']
    if end is not None:
        cmd += ['-to', f'{end:.3f}']
    cmd += ['-i', str(path)]
    if tempo != 1.0:
        chain = []
        t = tempo
        while t > 2.0:
            chain.append('atempo=2.0'); t /= 2.0
        chain.append(f'atempo={t:.4f}')
        cmd += ['-af', ','.join(chain)]
    cmd += ['-ac', '2', '-ar', str(SR), '-f', 'f32le', '-']
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def take(name, media_start, media_end, tempo=1.0):
    """A take's own audio for a span of its video time. The tapped audio file
    starts at the take's 'audioStart' (seconds into the video)."""
    a0 = json.load(open(HERE / f'film/assets/{name}.json'))['audioStart']
    return load(HERE / f'film/assets/{name}-audio.webm', tempo, media_start - a0, media_end - a0)


def place(bus, t, x, gain=1.0, fade=0.012):
    i = int(round(t * SR))
    x = x.copy() * gain
    k = int(fade * SR)
    if k and len(x) > 2 * k:
        ramp = np.linspace(0, 1, k)[:, None]
        x[:k] *= ramp; x[-k:] *= ramp[::-1]
    end = min(len(bus), i + len(x))
    bus[i:end] += x[: end - i]


def rms(x):
    return float(np.sqrt(np.mean(x ** 2)) + 1e-9)


def main():
    act_voice = load(HERE / 'out/act-voice.wav')
    act_len = len(act_voice) / SR
    show0 = F['show']['film']
    total = show0 + act_len + F['end']['seconds']
    n = int(total * SR) + SR
    voice = np.zeros((n, 2))

    # The act's band, scored on its own timeline (show time 0 = act video 0.5 s).
    act_mix_band = M.score(TL, offset=F['act']['preroll'])
    act_band = M.master(act_mix_band, M.duck_curve(TL, act_mix_band.n, F['act']['preroll']))
    act_band = act_band[: len(act_voice)]
    v_ref = rms(act_voice[act_voice.any(1)])
    band_gain = 0.42 * v_ref / rms(act_band)
    act = act_voice.copy()
    act[: len(act_band)] += act_band * band_gain

    # 1. Cold open: the act from its scat, voice and band together.
    c0, c1 = F['cold']['film']
    m0 = F['cold']['media']
    piece = act[int(m0 * SR): int((m0 + (c1 - c0) + 0.9) * SR)].copy()
    tail = int(0.9 * SR)
    piece[-tail:] *= np.linspace(1, 0, tail)[:, None] ** 2  # the stab rings into the title
    place(voice, c0, piece)

    # 3-4. The app takes' own audio (the plugin's output, recorded in the app).
    sing = F['sing']
    seg = take('agent', sing['media'], sing['media'] + (sing['film'][1] - sing['film'][0]))
    app_gain = v_ref / rms(seg[np.abs(seg).max(1) > 1e-3])
    place(voice, sing['film'][0], seg * app_gain)

    # 5. Physics: the sustained vowel, the seal's silence, the hum (sped-up stretches keep pitch).
    ph = F['physics']
    for p in ph['pieces']:
        a, b = p['media']
        x = take('physics', a, b, p['rate'])
        place(voice, p['film'], x * app_gain)

    # 7. The act.
    place(voice, show0, act)

    # The band under the app scenes.
    band = M.Mix(total + 2)
    down = sing['film'][0] + (sing['downbeat_media'] - sing['media'])
    beat = 60 / 132
    start = F['title']['film'][0] + 1.3
    bars = int((down - start) / (4 * beat))
    vamp_from = down - bars * 4 * beat
    M.vamp(band, vamp_from, bars * 4 * beat)
    verse = TL['sections'][3]
    notes = [{**nn, 't': down + (nn['t'] - verse['downbeat'])} for nn in verse['notes']]
    M.play_verse(band, down, 132, notes)
    # Physics: a held chord under the vowel; the band stops dead at the seal; a hum returns.
    p0 = ph['pieces'][0]['film']
    M.hold(band, p0 + 0.1, ph['seal_film'] - p0 - 0.1, 'C69', 0.5)
    M.hold(band, ph['hum_film'], 2.6, 'Fm6', 0.4)
    # Into the act: a cymbal swell.
    z0, z1 = F['zoom']['film']
    band.add('fx', z0 - 0.4, M.swell(z1 - z0 + 0.4, 0.8))
    # End card: the final chord.
    endt = show0 + act_len
    for k, note in enumerate(M.CHORDS['C69'] + [76, 79]):
        band.add('keys', endt + 0.15 + 0.03 * k, M.rhodes(note, 3.2, 0.6), pan=-0.35 + 0.1 * k)
    band.add('vibes', endt + 0.4, M.vibes(84, 2.5, 0.5), pan=0.3)
    band.add('bass', endt + 0.15, M.bass(36, 3.2, 0.7))
    app_band = M.master(band)
    # The seal cut is a hard stop: nothing of the band rings past it.
    s = int(ph['seal_film'] * SR)
    h = int(ph['hum_film'] * SR)
    app_band[s:h] *= 0
    # The app band stops where the act's own band takes over.
    cut = int((show0 + 0.2) * SR)
    k = int(0.3 * SR)
    app_band[cut - k:cut] *= np.linspace(1, 0, k)[:, None]
    app_band[cut:int(endt * SR)] = 0

    mix = voice[: len(app_band)].copy()
    L = min(len(mix), len(app_band))
    mix[:L] += app_band[:L] * band_gain * 0.9
    peak = np.abs(mix).max()
    mix *= 0.89 / peak
    out = HERE / 'film/assets/soundtrack.wav'
    wavfile.write(out, SR, (mix * 32767).astype(np.int16))
    print(f'wrote {out}: {len(mix) / SR:.2f} s; act {act_len:.2f} s from {show0:.2f}; in-app downbeat {down:.2f}; peak before norm {peak:.2f}')


if __name__ == '__main__':
    main()
