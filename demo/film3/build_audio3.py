"""Build the third demo film (with the jam)'s soundtrack from film3/film.json: the app takes' own
audio (the plugin's output, tapped in the app), the act (voice + band), and the band
under the agent scenes.

usage: python demo/build_audio3.py  (paths are relative to demo/)
Needs demo/out/timeline.json and the takes and act in film3/assets.
Writes film3/assets/soundtrack.wav (48 kHz stereo, peak -1 dBFS).
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import music as M  # noqa: E402
from build_audio import load, place, rms  # noqa: E402

HERE = Path(__file__).resolve().parent.parent
A = HERE / 'film3/assets'
SR = M.SR
F = json.load(open(HERE / 'film3/film.resolved.json'))  # written by film3/build_film.py
TL = json.load(open(HERE / 'out/timeline.json'))


def take(name, media_start, media_end):
    """A take's own audio for a span of its video time; silence where the tap had not started yet."""
    a0 = json.load(open(A / f'{name}.json'))['audioStart']
    if media_end <= a0:
        return np.zeros((int((media_end - media_start) * SR), 2))
    x = load(A / f'{name}-audio.webm', 1.0, max(0.0, media_start - a0), media_end - a0)
    pad = int(max(0.0, a0 - media_start) * SR)
    return np.concatenate([np.zeros((pad, 2)), x]) if pad else x


def onset(x, thr=0.02):
    e = np.sqrt(np.convolve((x ** 2).mean(1), np.ones(240) / 240, 'same'))
    i = np.where(e > thr)[0]
    return i[0] / SR if len(i) else 0.0


def play_song(m, d, bpm, notes, chords):
    """A band part under a song from its downbeat `d`: walking bass and comping on `chords`
    [(chord, beats)], brushes, a crash on the last beat, the vibes doubling `notes` (absolute t)."""
    beat = 60 / bpm
    t = d
    for i, (chord, beats) in enumerate(chords):
        nxt = chords[i + 1][0] if i + 1 < len(chords) else None
        M.walk(m, t, beat, chord, beats, nxt)
        M.comp(m, t, beat, chord, beats)
        t += beats * beat
    total = sum(b for _, b in chords)
    M.drums(m, d, beat, total)
    m.add('drums', d + total * beat, M.crash(0.45, 1.8), pan=0.3)
    M.melody(m, {'notes': notes})


# The agent's song (C major): C6 under the first two lines, Dm7 under the third, G7 to C6 at the end.
SONG_CHORDS = [('C6', 4), ('C69', 4), ('Dm7', 4), ('G7', 2), ('C6', 2)]


def main():
    total = F['total']
    n = int((total + 1) * SR)
    voice = np.zeros((n, 2))
    app0 = F['app']['film']
    pre = F['act']['preroll']

    # The act: her voice from the render, the band scored on the same timeline.
    act_voice = load(A / 'act.mp4')
    band_act = M.score(TL, offset=pre)
    band_act = M.master(band_act, M.duck_curve(TL, band_act.n, pre))[: len(act_voice)]
    v_ref = rms(act_voice[np.abs(act_voice).max(1) > 1e-3])
    band_gain = 0.42 * v_ref / rms(band_act)
    act = act_voice.copy()
    act[: len(band_act)] += band_act * band_gain

    # 1. Cold open: "my lips go boop boop boop!", ringing out into the title.
    c0, c1 = F['cold']['film']
    m0 = F['cold']['media']
    piece = act[int(m0 * SR): int((m0 + (c1 - c0) + 0.8) * SR)].copy()
    tail = int(0.8 * SR)
    piece[-tail:] *= np.linspace(1, 0, tail)[:, None] ** 2
    place(voice, c0, piece)

    # 2. The app takes' own audio, each segment matched to the act's short-term loudness
    #    (beatbox is mostly gaps, so it is matched by its hits). Fast-forwarded waits are silent.
    def loud(x):
        e = np.sqrt(np.convolve((x ** 2).mean(1), np.ones(4800) / 4800, 'valid'))
        return float(np.percentile(e, 90)) if len(e) else 0.0
    target = loud(act_voice)
    segs = {s['id']: s for s in F['segments']}
    gains = {}
    for s in F['segments']:
        if s.get('rate'):
            continue
        x = take(s['take'], s['media'], s.get('audio_until', s['end']))
        if loud(x) < 1e-3:
            continue
        if s['id'] in ('beat', 'pads'):
            g = 0.9 * np.abs(act_voice).max() / np.abs(x).max()
        else:
            g = target / loud(x)
        gains[s['id']] = round(float(g), 2)
        k = int(0.25 * SR)
        if s.get('audio_until'):
            x[-k:] *= np.linspace(1, 0, k)[:, None]
        place(voice, app0 + s['a'], x * g, fade=0.02)

    # 3. The act after the dive.
    sh = F['show']
    piece = act[int(sh['media'] * SR): int((sh['end'] + 0.6) * SR)].copy()
    k = int(0.6 * SR)
    piece[-k:] *= np.linspace(1, 0, k)[:, None]
    place(voice, F['show_film'], piece)

    # 4. The band under the agent scenes: a vamp from the title into her song at its tempo,
    #    landing on her first downbeat, then a part on the agent's own song under her singing.
    #    The act's verse ("my ...") shows how far her first sound leads the downbeat.
    verse = TL['sections'][3]
    act_down = verse['downbeat'] + pre
    w0 = act_down - 0.4
    lead = act_down - (w0 + onset(act_voice[int(w0 * SR): int((act_down + 0.4) * SR)]))
    sing = segs['sing']
    song = json.load(open(HERE / 'film3' / sing['song']))['song']
    bpm = song['bpm']
    beat = 60 / bpm
    down = app0 + sing['a'] + (sing['song_onset_media'] - sing['media']) + lead
    band = M.Mix(total + 2)
    start = F['title']['film'][0] + 0.6
    bars = int((down - start) / (4 * beat))
    M.vamp(band, down - bars * 4 * beat, bars * 4 * beat, bpm=bpm)
    notes = [{'t': down + nn['start'] * beat, 'beat': nn['start'], 'len': nn['length'] * beat, 'midi': nn['midi']} for nn in song['notes']]
    play_song(band, down, bpm, notes, SONG_CHORDS)
    song_end = down + sum(b for _, b in SONG_CHORDS) * beat
    # The second request: a soft held chord while it is typed and the reply lands; it clears for her beat.
    ask2 = segs['ask2']
    hold0 = max(app0 + ask2['a'] + 0.3, song_end + 0.6)
    M.hold(band, hold0, app0 + segs['beat']['a'] - 0.3 - hold0, 'C69', 0.4)
    # Into the act: a cymbal swell.
    d0, d1 = F['dive_a']
    band.add('fx', app0 + d0 - 0.4, M.swell(d1 - d0 + 0.4, 0.8))
    # End card: the final chord.
    endt = F['end_film']
    for i, note in enumerate(M.CHORDS['C69'] + [76, 79]):
        band.add('keys', endt + 0.15 + 0.03 * i, M.rhodes(note, 3.2, 0.6), pan=-0.35 + 0.1 * i)
    band.add('vibes', endt + 0.4, M.vibes(84, 2.5, 0.5), pan=0.3)
    band.add('bass', endt + 0.15, M.bass(36, 3.2, 0.7))
    app_band = M.master(band)
    # Silence under the beat, the instrument and the pads: only her sound.
    quiet0 = int((app0 + segs['beat']['a']) * SR)
    quiet1 = int((app0 + d0 - 0.4) * SR)
    k = int(0.25 * SR)
    app_band[quiet0 - k: quiet0] *= np.linspace(1, 0, k)[:, None]
    app_band[quiet0: quiet1] = 0
    # The act brings its own band.
    cut = int((F['show_film'] + 0.2) * SR)
    app_band[cut: int(endt * SR)] = 0
    # Under the song the band sits a little lower: she is the lead.
    s0 = int(down * SR)
    s1 = int(song_end * SR)
    app_band[s0: s1] *= 0.8

    mix = voice[: len(app_band)].copy()
    L = min(len(mix), len(app_band))
    mix[:L] += app_band[:L] * band_gain * 0.9
    peak = np.abs(mix).max()
    mix *= 0.89 / peak
    out = A / 'soundtrack.wav'
    wavfile.write(out, SR, (mix * 32767).astype(np.int16))
    print(f'wrote {out}: {len(mix) / SR:.2f} s; song downbeat {down:.2f} at {bpm} bpm (lead {lead:.3f}), ends {song_end:.2f}; gains {gains}; peak before norm {peak:.2f}')


if __name__ == '__main__':
    main()
