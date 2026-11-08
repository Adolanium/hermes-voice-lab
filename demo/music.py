"""Backing music for the demo videos, scored from the show's own timeline.

Original lounge-jazz accompaniment: upright bass, an electric piano, brushes and
ride, and a soft vibraphone that doubles the sung melody. Under spoken lines the
band holds a chord; it kicks in on each sung number's downbeat; a stab answers
the low "bah!", the beatbox gets a bass boogie, the finale a big ending, and the
last joke a rimshot. Everything is synthesised here (no samples).

usage: python demo/music.py demo/out/timeline.json <out.wav> [--offset S] [--vamp S]
  --offset S  where the show's time 0 falls in the output (e.g. 0.5 for the act
              video's pre-roll)
  --vamp S    a quiet vamp in the same key and groove from 0 to S seconds,
              e.g. under the app footage before the act
"""
import json
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
rng = np.random.default_rng(11)


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


class Mix:
    def __init__(self, seconds):
        self.n = int(seconds * SR) + SR
        self.bus = {k: np.zeros((self.n, 2)) for k in ('bass', 'keys', 'vibes', 'drums', 'fx')}

    def add(self, bus, t, sig, pan=0.0, gain=1.0):
        i = int(round(t * SR))
        if i >= self.n or len(sig) == 0:
            return
        if i < 0:
            sig = sig[-i:]
            i = 0
        sig = sig[: self.n - i] * gain
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.bus[bus][i:i + len(sig), 0] += sig * l * 1.414
        self.bus[bus][i:i + len(sig), 1] += sig * r * 1.414


def env(n, attack, tau, release=0.08, hold=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / tau)
    if hold is not None:
        r = np.clip((t - hold) / release, 0, 1)
        e *= 1 - r
    return e


def lowpass(x, hz, order=2):
    return sosfilt(butter(order, hz, 'low', fs=SR, output='sos'), x)


def highpass(x, hz, order=2):
    return sosfilt(butter(order, hz, 'high', fs=SR, output='sos'), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


# ---- Instruments ------------------------------------------------------------

def bass(midi, dur, vel=1.0):
    n = int((dur + 0.25) * SR)
    t = np.arange(n) / SR
    f = midi_hz(midi)
    x = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.18 * np.sin(6 * np.pi * f * t)
    x += 0.25 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.015)  # finger thump
    x = lowpass(x, 1100) * env(n, 0.004, 0.55, 0.12, hold=dur)
    return 0.55 * vel * x


def rhodes(midi, dur, vel=1.0):
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    f = midi_hz(midi)
    index = 1.6 * vel * np.exp(-t / 0.35) + 0.25
    x = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * f * t))
    x += 0.12 * np.sin(2 * np.pi * 7.1 * f * t) * np.exp(-t / 0.04)  # tine
    x *= env(n, 0.003, 1.6, 0.25, hold=dur) * (1 + 0.12 * np.sin(2 * np.pi * 4.6 * t))
    return 0.22 * vel * x


def vibes(midi, dur, vel=1.0):
    n = int((max(dur, 0.25) + 0.9) * SR)
    t = np.arange(n) / SR
    f = midi_hz(midi)
    x = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(2 * np.pi * 3.98 * f * t) * np.exp(-t / 0.25)
    x *= env(n, 0.002, 1.1, 0.4, hold=max(dur, 0.25)) * (1 + 0.35 * np.sin(2 * np.pi * 5.5 * t))
    return 0.2 * vel * x


def noise(n):
    return rng.standard_normal(n)


def brush(vel=1.0, long=False):
    n = int((0.35 if long else 0.18) * SR)
    x = bandpass(noise(n), 1500, 7000) * env(n, 0.012 if long else 0.004, 0.16 if long else 0.06)
    return 0.16 * vel * x


def ride(vel=1.0):
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    metal = sum(np.sin(2 * np.pi * f * t) for f in (3150, 4270, 5480, 6910)) * 0.08
    x = (highpass(noise(n), 5200) * 0.6 + metal) * env(n, 0.001, 0.32)
    return 0.07 * vel * x


def hat(vel=1.0):
    n = int(0.06 * SR)
    return 0.05 * vel * highpass(noise(n), 7000) * env(n, 0.001, 0.015)


def kick(vel=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 45 + 70 * np.exp(-t / 0.03)
    return 0.6 * vel * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.12)


def tom(hz, vel=1.0):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    f = hz * (1 + 0.5 * np.exp(-t / 0.02))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.14) + 0.2 * bandpass(noise(n), 800, 4000) * env(n, 0.001, 0.02)
    return 0.45 * vel * x


def crash(vel=1.0, seconds=2.2):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    metal = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in (2850, 3640, 4710, 5930, 7420)) * 0.06
    return 0.16 * vel * (highpass(noise(n), 3800) * 0.7 + metal) * env(n, 0.003, 0.9)


def swell(seconds, vel=1.0):
    """Cymbal roll building into a hit."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    return 0.1 * vel * highpass(noise(n), 4000) * (t / seconds) ** 2


# ---- Harmony ----------------------------------------------------------------

CHORDS = {
    'C6': [48, 55, 64, 69, 74], 'C69': [48, 55, 62, 64, 69], 'C7': [48, 58, 64, 67, 74], 'F7': [53, 57, 63, 67, 74],
    'G7': [43, 59, 65, 69, 76], 'G13': [43, 53, 59, 64, 69], 'A7': [45, 55, 61, 64, 71], 'Dm7': [50, 57, 60, 65, 69],
    'Fm6': [53, 56, 62, 65, 68], 'C/G': [43, 55, 64, 67, 72],
}
ROOT = {'C6': 36, 'C69': 36, 'C7': 36, 'F7': 41, 'G7': 43, 'G13': 43, 'A7': 45, 'Dm7': 38, 'Fm6': 41, 'C/G': 43}


def walk(m, t0, beat, chord, beats, nxt=None):
    """Walking bass: root, chord tones, then a chromatic approach to the next root."""
    r = ROOT[chord]
    tones = [r, r + (4 if chord not in ('Dm7', 'Fm6') else 3), r + 7, r + 9 if chord in ('C6', 'C69') else r + 10]
    for b in range(beats):
        note = tones[b % 4] if b < beats - 1 or nxt is None else ROOT[nxt] - 1
        m.add('bass', t0 + b * beat, bass(note, beat * 0.9, 0.95 if b % 2 == 0 else 0.8))


def comp(m, t0, beat, chord, beats, swing=2 / 3):
    """Electric piano on 2 and the and-of-4 (a light Charleston)."""
    for b in range(beats):
        hits = []
        if b % 4 == 1:
            hits.append((b, 0.5))
        if b % 4 == 3:
            hits.append((b + swing, 0.35))
        for at, length in hits:
            if at >= beats:
                continue
            for k, note in enumerate(CHORDS[chord][1:]):
                m.add('keys', t0 + at * beat + 0.006 * k, rhodes(note, length * beat, 0.7), pan=-0.25 + 0.12 * k)


def drums(m, t0, beat, beats, swing=2 / 3, kick_on=True):
    for b in range(beats):
        t = t0 + b * beat
        m.add('drums', t, ride(0.9 if b % 2 == 0 else 0.7), pan=0.35)
        if b % 2 == 1:
            m.add('drums', t + swing * beat, ride(0.55), pan=0.35)
            m.add('drums', t, hat(0.8), pan=0.2)
            m.add('drums', t, brush(0.9), pan=-0.1)
        else:
            m.add('drums', t - 0.04, brush(0.35, long=True), pan=-0.1)
        if kick_on and b % 4 == 0:
            m.add('drums', t, kick(0.5))


def hold(m, t0, seconds, chord, vel=0.55):
    """A held chord under speech: soft piano voicing with vibes shimmer, bass root."""
    for k, note in enumerate(CHORDS[chord][1:]):
        m.add('keys', t0 + 0.03 * k, rhodes(note, seconds, vel), pan=-0.3 + 0.15 * k)
    m.add('vibes', t0 + 0.1, vibes(CHORDS[chord][-1] + 12, min(seconds, 2.5), 0.35), pan=0.4)
    m.add('bass', t0, bass(ROOT[chord], seconds, 0.6))


def melody(m, sec, offset=0.0, gain=0.8):
    """The vibraphone doubles the sung melody, an octave up, a touch behind the voice."""
    for n in sec['notes']:
        m.add('vibes', offset + n['t'] + 0.012, vibes(n['midi'] + 12, n['len'], gain), pan=0.25)


# ---- The score --------------------------------------------------------------

def score(tl, offset=0.0, vamp_seconds=0.0):
    m = Mix(tl['length'] + offset + 3.0)
    S = tl['sections']
    o = offset

    if vamp_seconds > 0:
        vamp(m, 0.0, vamp_seconds)
    # 1. "Hello, hello! Is this thing on?" — a soft chord, the band waiting.
    hold(m, o + S[0]['start'] + 0.1, S[0]['end'] - S[0]['start'], 'C69', 0.45)
    # 2. "I'm just a tube, with a tongue. Hit it!" — dominant tension, then a pickup fill.
    hold(m, o + S[1]['start'], S[2]['downbeat'] - S[1]['start'] - 0.3, 'G13', 0.5)
    d = o + S[2]['downbeat']
    beat = 60 / S[2]['bpm']
    for k, hz in enumerate((210, 180, 150)):
        m.add('drums', d - (3 - k) * beat / 3, tom(hz, 0.7), pan=-0.3 + 0.3 * k)
    m.add('fx', d - 1.2, swell(1.2, 0.8), pan=0.2)
    # 3. Scat (150, swing): C7 for a bar, F7, then a stab on the low "bah!".
    sec = S[2]
    walk(m, d, beat, 'C7', 4, 'F7'); comp(m, d, beat, 'C7', 4)
    walk(m, d + 4 * beat, beat, 'F7', 2, 'G7'); comp(m, d + 4 * beat, beat, 'F7', 2)
    drums(m, d, beat, 6)
    stab = d + 6 * beat
    for k, note in enumerate(CHORDS['G7']):
        m.add('keys', stab + 0.004 * k, rhodes(note, 1.2 * beat, 1.0), pan=-0.3 + 0.15 * k)
    m.add('bass', stab, bass(31, 1.4 * beat, 1.0))
    m.add('drums', stab, kick(0.9)); m.add('drums', stab, crash(0.7, 1.6), pan=0.3)
    melody(m, sec, o)
    # 4. Verse (132): | C6 | C6 G7 | G7 | C7 |, the vibes doubling every word.
    play_verse(m, o + S[3]['downbeat'], S[3]['bpm'], [{**n, 't': n['t'] + o} for n in S[3]['notes']])
    # 5. "No samples. No auto tune. Just physics!" — stop-time: a stab under each claim.
    sec = S[4]
    claims = [c for c in tl['cues'] if sec['start'] <= c['t'] - o < sec['end'] and c['text'].endswith(('.', '!'))]
    for c, chord in zip(claims, ('Fm6', 'Fm6', 'G7')):
        for k, note in enumerate(CHORDS[chord][1:]):
            m.add('keys', o + c['end'] - 0.02 + 0.005 * k, rhodes(note, 0.35, 0.9), pan=-0.3 + 0.15 * k)
        m.add('bass', o + c['end'] - 0.02, bass(ROOT[chord], 0.35, 0.9))
        m.add('drums', o + c['end'] - 0.02, kick(0.6))
    # 6. Beatbox (150): she is the drums; the bass plays a boogie, the keys a riff.
    sec = S[5]
    d = o + sec['downbeat']
    beat = 60 / sec['bpm']
    boogie = [36, 40, 43, 45, 46, 45, 43, 40, 36, 40, 43, 45]
    for k, note in enumerate(boogie):
        m.add('bass', d + k * beat / 2, bass(note, beat * 0.45, 0.9))
    for b in (1, 3, 5):
        for k, note in enumerate(CHORDS['C7'][1:]):
            m.add('keys', d + b * beat + 0.005 * k, rhodes(note, 0.3 * beat, 0.6), pan=-0.3 + 0.15 * k)
    # 7. Finale (150): C6 | F7 C/G | F7 G7 | big ending on "yay".
    sec = S[6]
    d = o + sec['downbeat']
    beat = 60 / sec['bpm']
    plan = [('C6', 2, 'F7'), ('F7', 1, 'C/G'), ('C/G', 1, 'F7'), ('F7', 1, 'G7'), ('G7', 1, 'C69')]
    t = d
    for chord, beats, nxt in plan:
        walk(m, t, beat, chord, beats, nxt); comp(m, t, beat, chord, beats)
        t += beats * beat
    drums(m, d, beat, 6)
    for b, hz in ((2, 1), (3, 1), (4, 1), (5, 1)):  # band hits with each hey/ho
        m.add('drums', d + b * beat, kick(0.7))
    end = d + 6 * beat
    m.add('fx', end, swell(4 * beat, 0.9), pan=-0.2)
    for k, note in enumerate(CHORDS['C69'] + [76]):
        m.add('keys', end + 0.006 * k, rhodes(note, 4 * beat, 0.9), pan=-0.35 + 0.12 * k)
    m.add('bass', end, bass(36, 4 * beat, 1.0))
    last = o + sec['notes'][-1]['t'] + sec['notes'][-1]['len']
    for k, note in enumerate(CHORDS['C69'] + [76, 79]):
        m.add('keys', last + 0.005 * k, rhodes(note, 1.4, 1.0), pan=-0.35 + 0.1 * k)
    m.add('bass', last, bass(24, 1.4, 1.0)); m.add('drums', last, kick(1.0)); m.add('drums', last, crash(1.0, 2.6), pan=0.3)
    melody(m, sec, o)
    # 8. "Thank you! Thank you! Tip your physicist!" — a soft tag, then the rimshot.
    sec = S[7]
    hold(m, o + sec['start'] + 0.2, 2.2, 'C69', 0.35)
    punch = [c for c in tl['cues'] if c['text'].lower().startswith('physicist')]
    if punch:
        p = o + punch[-1]['end'] + 0.12
        m.add('drums', p, tom(220, 0.8), pan=-0.2)
        m.add('drums', p + 0.16, tom(150, 0.9), pan=0.1)
        m.add('drums', p + 0.32, crash(0.8, 1.4), pan=0.35)
    return m


def play_verse(m, d, bpm, notes):
    """The verse's band part from its downbeat `d` (seconds), with the vibes on `notes` (absolute t)."""
    beat = 60 / bpm
    t = d
    for chord, beats, nxt in [('C6', 4, 'C6'), ('C6', 2, 'G7'), ('G7', 2, 'G7'), ('G7', 4, 'C7'), ('C7', 4, None)]:
        walk(m, t, beat, chord, beats, nxt); comp(m, t, beat, chord, beats)
        t += beats * beat
    drums(m, d, beat, 16)
    m.add('drums', d + 15 * beat, crash(0.45, 1.8), pan=0.3)
    melody(m, {'notes': notes})


def vamp(m, t0, seconds, bpm=132):
    """A quiet lounge vamp (C6 A7 Dm7 G7) for the app footage before the act."""
    beat = 60 / bpm
    bars = int(seconds / (4 * beat))
    turn = ['C6', 'A7', 'Dm7', 'G7']
    for bar in range(bars):
        chord = turn[bar % 4]
        nxt = turn[(bar + 1) % 4]
        t = t0 + bar * 4 * beat
        walk(m, t, beat, chord, 4, nxt)
        comp(m, t, beat, chord, 4)
        drums(m, t, beat, 4, kick_on=bar % 2 == 0)


def reverb(x, seconds=1.6, wet=0.16):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.stack([rng.standard_normal(n) * np.exp(-t / (seconds / 6.9)) for _ in range(2)], 1)
    ir[:, 0] = lowpass(ir[:, 0], 6000)
    ir[:, 1] = lowpass(ir[:, 1], 6000)
    ir /= np.sqrt((ir ** 2).sum(0))
    out = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    return x * (1 - wet) + out * wet * 2.0


def master(m, duck=None):
    levels = {'bass': 1.0, 'keys': 0.8, 'vibes': 0.55, 'drums': 0.9, 'fx': 0.8}
    x = sum(m.bus[k] * g for k, g in levels.items())
    x = reverb(x)
    if duck is not None:
        x *= duck[: len(x), None]
    peak = np.abs(x).max()
    return x / peak * 0.89 if peak > 0 else x  # −1 dBFS peak; the voice sits on top later


def duck_curve(tl, n, offset, depth=0.6):
    """Lower the band under spoken words so every line reads."""
    g = np.ones(n)
    for s in tl['sections']:
        if s['kind'] != 'say':
            continue
        a, b = int((offset + s['start']) * SR), int((offset + s['end']) * SR)
        g[a:b] = np.minimum(g[a:b], depth)
    k = int(0.12 * SR)
    kernel = np.ones(k) / k
    return np.convolve(g, kernel, mode='same')


def main():
    args = sys.argv[1:]
    opt = {'--offset': 0.0, '--vamp': 0.0}
    for k in opt:
        if k in args:
            i = args.index(k); opt[k] = float(args[i + 1]); del args[i:i + 2]
    tl = json.load(open(args[0]))
    m = score(tl, offset=opt['--offset'], vamp_seconds=opt['--vamp'])
    x = master(m, duck_curve(tl, m.n, opt['--offset']))
    wavfile.write(args[1], SR, (x * 32767).astype(np.int16))
    print(f'wrote {args[1]}: {len(x) / SR:.1f} s, show at {opt["--offset"]:.2f} s, vamp {opt["--vamp"]:.1f} s')


if __name__ == '__main__':
    main()
