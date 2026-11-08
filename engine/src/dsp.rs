//! Small DSP building blocks with fixed, bounded cost.

use std::f32::consts::PI;

/// xorshift32 random source; deterministic for a given seed.
#[derive(Clone)]
pub struct Rng(u32);

impl Rng {
    pub fn new(seed: u32) -> Self {
        Self(seed.max(1))
    }
    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
    /// Uniform in [-1, 1).
    #[inline]
    pub fn uniform(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / (1u32 << 23) as f32 - 1.0
    }
    /// Approximately Gaussian (sum of four uniforms), unit variance.
    #[inline]
    pub fn gauss(&mut self) -> f32 {
        (self.uniform() + self.uniform() + self.uniform() + self.uniform()) * 0.866
    }
}

/// Direct-form-I biquad.
#[derive(Clone, Copy, Default)]
pub struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl Biquad {
    pub fn lowpass(&mut self, cutoff: f32, q: f32, rate: f32) {
        let w = 2.0 * PI * (cutoff / rate).clamp(1e-4, 0.49);
        let (s, c) = w.sin_cos();
        let alpha = s / (2.0 * q);
        let a0 = 1.0 + alpha;
        self.b0 = (1.0 - c) * 0.5 / a0;
        self.b1 = (1.0 - c) / a0;
        self.b2 = self.b0;
        self.a1 = -2.0 * c / a0;
        self.a2 = (1.0 - alpha) / a0;
    }
    pub fn highpass(&mut self, cutoff: f32, q: f32, rate: f32) {
        let w = 2.0 * PI * (cutoff / rate).clamp(1e-4, 0.49);
        let (s, c) = w.sin_cos();
        let alpha = s / (2.0 * q);
        let a0 = 1.0 + alpha;
        self.b0 = (1.0 + c) * 0.5 / a0;
        self.b1 = -(1.0 + c) / a0;
        self.b2 = self.b0;
        self.a1 = -2.0 * c / a0;
        self.a2 = (1.0 - alpha) / a0;
    }
    pub fn bandpass(&mut self, center: f32, q: f32, rate: f32) {
        let w = 2.0 * PI * (center / rate).clamp(1e-4, 0.49);
        let (s, c) = w.sin_cos();
        let alpha = s / (2.0 * q);
        let a0 = 1.0 + alpha;
        self.b0 = alpha / a0;
        self.b1 = 0.0;
        self.b2 = -alpha / a0;
        self.a1 = -2.0 * c / a0;
        self.a2 = (1.0 - alpha) / a0;
    }
    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = if y.is_finite() { y } else { 0.0 };
        self.y1
    }
    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }
}

/// Converts the variable internal tick rate to the host rate: an 8th-order
/// Butterworth anti-alias filter at the internal rate followed by cubic
/// (Catmull–Rom) interpolation.
pub struct Resampler {
    filters: [Biquad; 4],
    history: [f32; 4],
    designed_rate: f32,
    cutoff: f32,
}

const BUTTERWORTH_Q: [f32; 4] = [0.5098, 0.6013, 0.9000, 2.5629];

impl Resampler {
    pub fn new(output_rate: f32) -> Self {
        Self {
            filters: [Biquad::default(); 4],
            history: [0.0; 4],
            designed_rate: 0.0,
            cutoff: (0.42 * output_rate).min(20_000.0),
        }
    }
    pub fn design(&mut self, internal_rate: f32) {
        if (internal_rate - self.designed_rate).abs() < internal_rate * 0.004 {
            return;
        }
        self.designed_rate = internal_rate;
        for (f, q) in self.filters.iter_mut().zip(BUTTERWORTH_Q) {
            f.lowpass(self.cutoff, q, internal_rate);
        }
    }
    #[inline]
    pub fn push(&mut self, x: f32) {
        let mut y = x;
        for f in self.filters.iter_mut() {
            y = f.process(y);
        }
        self.history = [self.history[1], self.history[2], self.history[3], y];
    }
    /// Interpolate between history[1] and history[2] at fraction t.
    #[inline]
    pub fn read(&self, t: f32) -> f32 {
        let [y0, y1, y2, y3] = self.history;
        let a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
        let b = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
        let c = -0.5 * y0 + 0.5 * y2;
        ((a * t + b) * t + c) * t + y1
    }
    pub fn reset(&mut self) {
        self.history = [0.0; 4];
        for f in self.filters.iter_mut() {
            f.reset();
        }
    }
}

/// A compact feedback delay network room: four lines, Householder mixing,
/// one-pole damping. Buffers are allocated once at construction.
pub struct Room {
    lines: [Vec<f32>; 4],
    pos: [usize; 4],
    damp: [f32; 4],
    feedback: f32,
    damping: f32,
    pre: Vec<f32>,
    pre_pos: usize,
}

impl Room {
    pub fn new(rate: f32) -> Self {
        let ms = [31.7f32, 37.3, 41.9, 47.1];
        let len = |m: f32| ((m * 0.001 * rate) as usize).max(8);
        let rt60 = 1.25f32;
        let mean = ms.iter().sum::<f32>() / 4.0 * 0.001;
        Self {
            lines: [vec![0.0; len(ms[0])], vec![0.0; len(ms[1])], vec![0.0; len(ms[2])], vec![0.0; len(ms[3])]],
            pos: [0; 4],
            damp: [0.0; 4],
            feedback: 10f32.powf(-3.0 * mean / rt60),
            damping: 1.0 - (-2.0 * PI * 5200.0 / rate).exp(),
            pre: vec![0.0; ((0.012 * rate) as usize).max(4)],
            pre_pos: 0,
        }
    }
    /// Returns (left, right) wet signal.
    #[inline]
    pub fn process(&mut self, x: f32) -> (f32, f32) {
        let delayed = self.pre[self.pre_pos];
        self.pre[self.pre_pos] = x;
        self.pre_pos = (self.pre_pos + 1) % self.pre.len();
        let mut out = [0.0f32; 4];
        for i in 0..4 {
            out[i] = self.lines[i][self.pos[i]];
        }
        let sum = (out[0] + out[1] + out[2] + out[3]) * 0.5;
        for i in 0..4 {
            let mixed = (out[i] - sum) * self.feedback;
            self.damp[i] += self.damping * (mixed - self.damp[i]);
            let v = self.damp[i] + delayed * 0.5;
            self.lines[i][self.pos[i]] = if v.is_finite() { v } else { 0.0 };
            self.pos[i] = (self.pos[i] + 1) % self.lines[i].len();
        }
        (out[0] - out[2] * 0.6 + out[1] * 0.3, out[1] - out[3] * 0.6 + out[2] * 0.3)
    }
    pub fn reset(&mut self) {
        for l in self.lines.iter_mut() {
            l.iter_mut().for_each(|v| *v = 0.0);
        }
        self.pre.iter_mut().for_each(|v| *v = 0.0);
        self.damp = [0.0; 4];
    }
}

/// Maximum limiter look-ahead in samples (2 ms at 192 kHz).
const LOOKAHEAD_MAX: usize = 512;

/// Transparent output dynamics: a slow RMS leveler (gentle ratio, so
/// sustained notes are evened out without pumping) followed by a
/// look-ahead peak limiter. Fixed-size state; no allocation.
pub struct Dynamics {
    ms: f32,
    ms_coeff: f32,
    gr_db: f32,
    lev_attack: f32,
    lev_release: f32,
    lim_gain: f32,
    lim_attack: f32,
    lim_release: f32,
    delay_l: [f32; LOOKAHEAD_MAX],
    delay_r: [f32; LOOKAHEAD_MAX],
    pos: usize,
    look: usize,
}

/// Leveler threshold (dBFS, short-term RMS) and ratio above it.
const LEVEL_THRESHOLD_DB: f32 = -20.0;
const LEVEL_RATIO: f32 = 3.0;
/// Limiter ceiling (linear), ahead of the soft clipper.
const LIMIT: f32 = 0.8;

impl Dynamics {
    pub fn new(rate: f32) -> Self {
        let c = |seconds: f32| 1.0 - (-1.0 / (seconds * rate)).exp();
        let look = ((0.002 * rate) as usize).clamp(1, LOOKAHEAD_MAX);
        Self {
            ms: 0.0,
            ms_coeff: c(0.08),
            gr_db: 0.0,
            lev_attack: c(0.06),
            lev_release: c(0.35),
            lim_gain: 1.0,
            lim_attack: c(look as f32 / rate / 3.0),
            lim_release: c(0.2),
            delay_l: [0.0; LOOKAHEAD_MAX],
            delay_r: [0.0; LOOKAHEAD_MAX],
            pos: 0,
            look,
        }
    }

    pub fn reset(&mut self) {
        self.ms = 0.0;
        self.gr_db = 0.0;
        self.lim_gain = 1.0;
        self.delay_l = [0.0; LOOKAHEAD_MAX];
        self.delay_r = [0.0; LOOKAHEAD_MAX];
    }

    #[inline]
    pub fn process(&mut self, l: f32, r: f32) -> (f32, f32) {
        // Leveler: dB-domain gain reduction from short-term mean square.
        self.ms += self.ms_coeff * (0.5 * (l * l + r * r) - self.ms);
        let level_db = 10.0 * (self.ms + 1e-12).log10();
        let want = ((level_db - LEVEL_THRESHOLD_DB) * (1.0 - 1.0 / LEVEL_RATIO)).max(0.0);
        let k = if want > self.gr_db { self.lev_attack } else { self.lev_release };
        self.gr_db += k * (want - self.gr_db);
        let g = 10f32.powf(-self.gr_db / 20.0);
        let (l, r) = (l * g, r * g);
        // Limiter: the gain needed by the incoming sample is reached before
        // that sample leaves the delay line.
        let need = (LIMIT / l.abs().max(r.abs()).max(1e-9)).min(1.0);
        let k = if need < self.lim_gain { self.lim_attack } else { self.lim_release };
        self.lim_gain += k * (need - self.lim_gain);
        let i = self.pos;
        let (dl, dr) = (self.delay_l[i], self.delay_r[i]);
        self.delay_l[i] = l;
        self.delay_r[i] = r;
        self.pos = if i + 1 >= self.look { 0 } else { i + 1 };
        (dl * self.lim_gain, dr * self.lim_gain)
    }
}
