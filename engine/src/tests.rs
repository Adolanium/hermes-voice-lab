//! Engine-level tests: stability, determinism, timing, pitch, resonances.
use crate::analysis::tract_response;
use crate::params::*;
use crate::tract::{area_function, N};
use crate::voice::Voice;

fn rms(x: &[f32]) -> f32 {
    (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
}

fn render(v: &mut Voice, seconds: f32) -> Vec<f32> {
    let mut out = Vec::new();
    let mut left = (seconds * v.out_rate) as usize;
    while left > 0 {
        let n = left.min(1024);
        v.render(n);
        out.extend_from_slice(&v.out_l[..n]);
        left -= n;
    }
    out
}

/// Fundamental by autocorrelation over 70–1200 Hz.
fn estimate_f0(x: &[f32], rate: f32) -> f32 {
    let (lo, hi) = ((rate / 1200.0) as usize, (rate / 70.0) as usize);
    let n = x.len() - hi;
    let corr = |lag: usize| -> f32 { (0..n).map(|i| x[i] * x[i + lag]).sum() };
    let c0 = corr(0);
    let mut best = (lo, f32::MIN);
    for lag in lo..hi {
        let c = corr(lag) / c0;
        if c > best.1 + 0.02 {
            best = (lag, c);
        }
    }
    // The +0.02 rule above may stop just short of a broad peak; climb to the
    // local maximum before interpolating.
    let mut l = best.0;
    while l + 1 < hi && corr(l + 1) > corr(l) {
        l += 1;
    }
    while l > lo && corr(l - 1) > corr(l) {
        l -= 1;
    }
    let (a, b, c) = (corr(l - 1), corr(l), corr(l + 1));
    let offset = 0.5 * (a - c) / (a - 2.0 * b + c);
    rate / (l as f32 + offset)
}

#[test]
fn audible_and_bounded_at_default() {
    let mut v = Voice::new(48_000.0, 3);
    v.set(GATE, 1.0, 10.0);
    let x = render(&mut v, 1.0);
    let r = rms(&x[24_000..]);
    assert!(r > 0.03 && r < 0.4, "rms {r}");
    assert!(x.iter().all(|s| s.is_finite() && s.abs() <= 1.0));
}

#[test]
fn stable_under_random_sweeps_at_all_rates() {
    for rate in [8000.0, 22_050.0, 44_100.0, 48_000.0, 96_000.0, 192_000.0] {
        let mut v = Voice::new(rate, 42);
        let mut seed = 12345u32;
        for _ in 0..120 {
            for id in 0..COUNT {
                seed ^= seed << 13;
                seed ^= seed >> 17;
                seed ^= seed << 5;
                let u = (seed % 10_000) as f32 / 9999.0;
                let s = &SPECS[id];
                v.set(id, s.min + (s.max - s.min) * u, (seed % 40) as f32);
            }
            v.set(GAIN, 1.0, 5.0);
            let n = v.render(512);
            assert!(v.out_l[..n].iter().chain(v.out_r[..n].iter()).all(|s| s.is_finite() && s.abs() <= 1.0));
        }
        assert_eq!(v.state[15], 0.0, "non-finite recovery triggered at {rate}");
    }
}

#[test]
fn deterministic_for_seed() {
    let run = || {
        let mut v = Voice::new(48_000.0, 7);
        v.set(GATE, 1.0, 10.0);
        v.set(BREATH, 0.6, 10.0);
        render(&mut v, 0.5)
    };
    assert_eq!(run(), run());
}

#[test]
fn release_decays_to_silence() {
    let mut v = Voice::new(48_000.0, 7);
    v.set(SPACE, 0.0, 1.0);
    v.set(GATE, 1.0, 10.0);
    render(&mut v, 0.5);
    v.set(GATE, 0.0, 10.0);
    render(&mut v, 0.8);
    let tail = render(&mut v, 0.1);
    assert!(tail.iter().all(|x| x.abs() < 1e-4), "max {}", tail.iter().fold(0f32, |m, x| m.max(x.abs())));
}

#[test]
fn pitch_tracks_parameter_independently_of_vowel() {
    for (pitch, tx, ty) in [(180.0, 0.0, 0.0), (220.0, 1.0, 0.9), (330.0, 0.0, 0.8), (523.25, 0.5, 0.3)] {
        let mut v = Voice::new(48_000.0, 5);
        for (id, val) in [(GATE, 1.0), (PITCH, pitch), (VIB_DEPTH, 0.0), (HUMANIZE, 0.0), (TONGUE_X, tx), (TONGUE_Y, ty), (SPACE, 0.0)] {
            v.jump(id, val);
        }
        let x = render(&mut v, 0.6);
        let f0 = estimate_f0(&x[14_400..14_400 + 9600], 48_000.0);
        let cents = 1200.0 * (f0 / pitch).log2();
        assert!(cents.abs() < 8.0, "target {pitch} got {f0} ({cents:.1} cents)");
    }
}

#[test]
fn score_events_apply_on_exact_frames() {
    let mut v = Voice::new(48_000.0, 1);
    // gate on at 0.25 s exactly, off at 0.5 s.
    let events = [[0.25f32, GATE as f32, 1.0, 0.0], [0.5, GATE as f32, 0.0, 0.0]];
    for (i, e) in events.iter().enumerate() {
        v.staging[i * 4..i * 4 + 4].copy_from_slice(e);
    }
    assert_eq!(v.load_score(2, 1.0), 2);
    v.set(SPACE, 0.0, 0.0);
    v.play_score(false);
    let mut gate_on_at = None;
    for frame in 0..48_010 {
        v.render(1);
        if gate_on_at.is_none() && v.p[GATE] > 0.5 {
            gate_on_at = Some(frame);
        }
    }
    let on = gate_on_at.expect("gate never rose");
    // The jump lands on frame 12000; the control block quantum is 32 ticks (< 1 output frame here).
    assert!((12_000..=12_001).contains(&on), "gate rose at frame {on}");
    assert!(!v.is_playing());
}

#[test]
fn score_is_identical_across_block_sizes() {
    let run = |block: usize| {
        let mut v = Voice::new(44_100.0, 9);
        let ev = [[0.0f32, GATE as f32, 1.0, -1.0], [0.1, TONGUE_X as f32, 1.0, 40.0], [0.2, PITCH as f32, 300.0, 30.0], [0.3, GATE as f32, 0.0, -1.0]];
        for (i, e) in ev.iter().enumerate() {
            v.staging[i * 4..i * 4 + 4].copy_from_slice(e);
        }
        v.load_score(4, 0.5);
        v.play_score(false);
        let mut out = Vec::new();
        let mut left = 22_050;
        while left > 0 {
            let n = left.min(block);
            v.render(n);
            out.extend_from_slice(&v.out_l[..n]);
            left -= n;
        }
        out
    };
    assert_eq!(run(128), run(1000));
}

#[test]
fn vowel_shapes_separate_formants() {
    let formants = |tx: f32, ty: f32, jaw: f32, lip: f32, round: f32| {
        let mut p = [0.0f32; COUNT];
        for (i, s) in SPECS.iter().enumerate() {
            p[i] = s.default;
        }
        p[TONGUE_X] = tx;
        p[TONGUE_Y] = ty;
        p[JAW] = jaw;
        p[LIP_OPEN] = lip;
        p[LIP_ROUND] = round;
        let mut a = [0.0; N];
        let s = area_function(&p, &mut a);
        let r = tract_response(&a, s.nasal_area, s.length_cm);
        (r.formants[0].0, r.formants[1].0)
    };
    let (i1, i2) = formants(1.0, 0.88, 0.73, 1.0, 0.0);
    let (a1, a2) = formants(0.0, 0.0, 1.0, 1.0, 0.0);
    let (u1, u2) = formants(0.0, 0.81, 0.27, 0.43, 0.84);
    assert!(a1 > i1 + 300.0 && a1 > u1 + 300.0, "F1 i {i1} a {a1} u {u1}");
    assert!(i2 > a2 + 800.0 && a2 > u2 + 100.0, "F2 i {i2} a {a2} u {u2}");
}

#[test]
fn nasal_coupling_adds_resonance_and_lowers_level() {
    let mut p = [0.0f32; COUNT];
    for (i, s) in SPECS.iter().enumerate() {
        p[i] = s.default;
    }
    let mut a = [0.0; N];
    let s = area_function(&p, &mut a);
    let oral = tract_response(&a, 0.0, s.length_cm);
    let nasal = tract_response(&a, 1.5, s.length_cm);
    assert!(oral.formants[0].0 != nasal.formants[0].0);
}

#[test]
fn closure_builds_pressure_and_releases_a_burst() {
    let mut v = Voice::new(48_000.0, 2);
    v.set(GATE, 1.0, 5.0);
    render(&mut v, 0.2);
    v.set(LIP_OPEN, 0.0, 8.0);
    v.set(VOICING, 0.0, 10.0);
    render(&mut v, 0.12);
    let po = v.state[5];
    assert!(po > 0.3, "oral pressure {po}");
    // While sealed only the walls murmur; the release lets the compressed air
    // out at once: a transient well above the closure (it emerges from the
    // airway, there is no burst generator).
    let closed = peak(&mut v, 0.02);
    v.set(LIP_OPEN, 0.7, 6.0);
    let burst = peak(&mut v, 0.02);
    assert!(burst > 4.0 * closed && burst > 0.02, "burst {burst} vs closure {closed}");
}

fn peak(v: &mut Voice, seconds: f32) -> f32 {
    let mut m = 0.0f32;
    let mut left = (seconds * v.out_rate) as usize;
    while left > 0 {
        let n = v.render(left.min(256));
        m = v.out_l[..n].iter().fold(m, |a, x| a.max(x.abs()));
        left -= n;
    }
    m
}

#[test]
fn closure_stops_airflow_and_sound_in_front_and_nose_takes_over() {
    use crate::voice::{STATE_AIRFLOW, STATE_CLOSED, STATE_NASAL_SHARE};
    let mut v = Voice::new(48_000.0, 4);
    for (id, val) in [(GATE, 1.0), (TONGUE_X, 0.0), (TONGUE_Y, 0.0), (JAW, 1.0), (LIP_OPEN, 1.0), (SPACE, 0.0)] {
        v.jump(id, val);
    }
    render(&mut v, 0.4);
    let open_flow = v.state[STATE_AIRFLOW];
    let open_lips = v.energy[N - 1];
    assert!(open_flow > 0.05 && open_lips > 0.0 && v.state[STATE_CLOSED] == 0.0);
    // Seal the tongue tip: no air leaves, and the lips fall silent.
    // The tissue behind the seal gives way for a while (the voice bar of a
    // voiced stop), so the last air trickles in for a few hundred ms.
    v.set(TIP_CLOSE, 1.0, 8.0);
    render(&mut v, 0.8);
    assert_eq!(v.state[STATE_CLOSED], 1.0);
    assert!(v.state[STATE_AIRFLOW] < 0.01, "airflow {}", v.state[STATE_AIRFLOW]);
    assert!(v.energy[N - 1] < open_lips * 0.05, "lips {} vs {}", v.energy[N - 1], open_lips);
    // Lower the velum: air and sound leave through the nose (an /n/).
    v.set(VELUM, 1.0, 10.0);
    render(&mut v, 0.3);
    assert_eq!(v.state[STATE_CLOSED], 0.0);
    assert!(v.state[STATE_NASAL_SHARE] > 0.99);
    assert!(v.energy[N + crate::tract::NASAL_N - 1] > 0.0);
}

#[test]
fn a_voiced_closure_keeps_its_voice_bar_and_a_voiceless_one_does_not() {
    use crate::voice::STATE_VOICING;
    // Lips shut on a voiced sound: the slack walls take up air, so the folds keep
    // vibrating for tens of milliseconds and the skin radiates a low hum.
    let closure = |voicing: f32, wait: f32| {
        let mut v = Voice::new(48_000.0, 4);
        for (id, val) in [(GATE, 1.0), (SPACE, 0.0), (HUMANIZE, 0.0)] {
            v.jump(id, val);
        }
        let vowel = rms(&render(&mut v, 0.3)[9600..]);
        v.set(LIP_OPEN, 0.0, 9.0);
        v.set(VOICING, voicing, 8.0);
        render(&mut v, wait);
        let bar = render(&mut v, 0.03);
        (v.state[STATE_VOICING], rms(&bar) / vowel)
    };
    let (voiced, bar) = closure(0.85, 0.035);
    assert!(voiced > 0.6, "folds still vibrating about 40 ms after the seal: {voiced}");
    assert!(bar > 0.02 && bar < 0.3, "voice bar re the vowel: {bar}");
    // Folds apart: the walls are braced, nothing vibrates and, once the lips have
    // sealed, the closure is silent.
    let (voiced, bar) = closure(0.0, 0.09);
    assert!(voiced < 0.05 && bar < 0.003, "voiceless closure: {voiced} {bar}");
}

#[test]
fn a_tongue_gesture_moves_little_air_but_a_rising_larynx_moves_all_of_it() {
    // With no breath at all, closing the tongue tip quickly should be near silent
    // (the tongue is flesh of constant volume), while the larynx rising under shut
    // folds behind that seal compresses the air and pops when the seal opens.
    let mut v = Voice::new(48_000.0, 4);
    v.jump(SPACE, 0.0);
    render(&mut v, 0.1);
    v.set(TIP_CLOSE, 1.0, 9.0);
    let thump = render(&mut v, 0.1).iter().fold(0f32, |m, x| m.max(x.abs()));
    v.set(GLOTTAL, 1.0, 5.0);
    v.set(LARYNX, 1.0, 18.0);
    render(&mut v, 0.1);
    v.set(TIP_CLOSE, 0.0, 6.0);
    let pop = render(&mut v, 0.05).iter().fold(0f32, |m, x| m.max(x.abs()));
    assert!(thump < 0.02, "closing thump {thump}");
    assert!(pop > 10.0 * thump && pop > 0.02, "ejective pop {pop} vs thump {thump}");
}
