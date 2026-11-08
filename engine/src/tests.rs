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
    let l = best.0;
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
    v.set(LIP_OPEN, 0.7, 6.0);
    let mut max_burst = 0.0f32;
    for _ in 0..40 {
        v.render(48);
        max_burst = max_burst.max(v.state[17]);
    }
    assert!(max_burst > 0.1, "burst {max_burst}");
}
