//! Modeled tract response. Freezes an area function, drives the same digital
//! waveguide with an impulse, and measures the spectrum of its response. The
//! resulting peaks are the exact resonances of the synthesized system.

use crate::tract::{internal_rate, Waveguide, N};

pub const FFT_SIZE: usize = 8192;
pub const RESPONSE_BINS: usize = 256;
pub const RESPONSE_MAX_HZ: f32 = 8000.0;
pub const MAX_FORMANTS: usize = 5;

pub struct Response {
    /// dB magnitude on a linear 0..RESPONSE_MAX_HZ axis.
    pub magnitude: [f32; RESPONSE_BINS],
    /// (frequency Hz, -3 dB bandwidth Hz) pairs; zero when absent.
    pub formants: [(f32, f32); MAX_FORMANTS],
}

pub fn tract_response(areas: &[f32; N], nasal_area: f32, length_cm: f32) -> Response {
    let rate = internal_rate(length_cm);
    let mut wg = Waveguide::new();
    wg.set_areas(areas, nasal_area, rate);
    let mut re = vec![0.0f32; FFT_SIZE];
    let mut im = vec![0.0f32; FFT_SIZE];
    for (i, slot) in re.iter_mut().enumerate().take(FFT_SIZE / 2) {
        wg.tick(if i == 0 { 1.0 } else { 0.0 }, 0, 0.0);
        // Volume velocity arriving at the lips and nostrils: the tract's
        // volume-velocity transfer function, without the radiation tilt.
        *slot = wg.outflow();
    }
    fft(&mut re, &mut im);
    let bin_hz = rate / FFT_SIZE as f32;
    let half = FFT_SIZE / 2;
    let db: Vec<f32> = (0..half).map(|k| 10.0 * (re[k] * re[k] + im[k] * im[k] + 1e-20).log10()).collect();

    let mut magnitude = [0.0f32; RESPONSE_BINS];
    for (i, m) in magnitude.iter_mut().enumerate() {
        let f = i as f32 / (RESPONSE_BINS - 1) as f32 * RESPONSE_MAX_HZ;
        let x = f / bin_hz;
        let k = (x as usize).min(half - 2);
        let t = x - k as f32;
        *m = db[k] * (1.0 - t) + db[k + 1] * t;
    }

    let mut formants = [(0.0f32, 0.0f32); MAX_FORMANTS];
    let mut found = 0;
    let lo = (150.0 / bin_hz) as usize;
    let hi = ((6500.0 / bin_hz) as usize).min(half - 2);
    for k in lo.max(1)..hi {
        if found == MAX_FORMANTS {
            break;
        }
        if db[k] > db[k - 1] && db[k] >= db[k + 1] {
            // Parabolic peak interpolation.
            let (a, b, c) = (db[k - 1], db[k], db[k + 1]);
            let denom = a - 2.0 * b + c;
            let offset = if denom.abs() > 1e-9 { 0.5 * (a - c) / denom } else { 0.0 };
            let peak = b - 0.25 * (a - c) * offset;
            // Require some prominence relative to the surrounding valleys.
            let span = (250.0 / bin_hz) as usize;
            let left = db[k.saturating_sub(span)..k].iter().copied().fold(f32::MAX, f32::min);
            let right = db[k + 1..(k + span).min(half)].iter().copied().fold(f32::MAX, f32::min);
            if peak - left.max(right) < 2.0 {
                continue;
            }
            let freq = (k as f32 + offset) * bin_hz;
            let bw = bandwidth(&db, k, peak - 3.0) * bin_hz;
            formants[found] = (freq, bw);
            found += 1;
        }
    }
    Response { magnitude, formants }
}

fn bandwidth(db: &[f32], k: usize, level: f32) -> f32 {
    let mut l = k as f32;
    let mut i = k;
    while i > 0 && db[i] > level {
        i -= 1;
    }
    if i < k {
        l = i as f32 + (level - db[i]) / (db[i + 1] - db[i]).max(1e-6);
    }
    let mut r = k as f32;
    let mut j = k;
    while j + 1 < db.len() && db[j] > level {
        j += 1;
    }
    if j > k {
        r = j as f32 - (level - db[j]) / (db[j - 1] - db[j]).max(1e-6);
    }
    (r - l).max(0.0)
}

/// In-place iterative radix-2 FFT.
pub fn fft(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2.0 * std::f64::consts::PI / len as f64;
        for start in (0..n).step_by(len) {
            for k in 0..len / 2 {
                let (s, c) = (ang * k as f64).sin_cos();
                let (c, s) = (c as f32, s as f32);
                let a = start + k;
                let b = a + len / 2;
                let tr = re[b] * c - im[b] * s;
                let ti = re[b] * s + im[b] * c;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
        len <<= 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uniform_tube_resonates_at_odd_quarter_waves() {
        // A uniform tube closed at the glottis and open at the lips has
        // resonances near (2k-1)·c/4L. Our glottis reflects partially and the
        // lips radiate, so allow some tolerance.
        let areas = [3.0f32; N];
        let r = tract_response(&areas, 0.0, 15.0);
        let expected = [583.0, 1750.0, 2917.0];
        for (k, e) in expected.iter().enumerate() {
            let f = r.formants[k].0;
            assert!((f - e).abs() / e < 0.08, "F{} = {f}, expected ≈ {e}", k + 1);
        }
    }
}
