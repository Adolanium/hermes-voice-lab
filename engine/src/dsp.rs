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
    /// Peaking EQ (gain in dB) and shelves, after the audio EQ cookbook formulas.
    pub fn peak(&mut self, center: f32, q: f32, gain_db: f32, rate: f32) {
        let a = 10f32.powf(gain_db / 40.0);
        let w = 2.0 * PI * (center / rate).clamp(1e-4, 0.49);
        let (s, c) = w.sin_cos();
        let alpha = s / (2.0 * q);
        let a0 = 1.0 + alpha / a;
        self.b0 = (1.0 + alpha * a) / a0;
        self.b1 = -2.0 * c / a0;
        self.b2 = (1.0 - alpha * a) / a0;
        self.a1 = -2.0 * c / a0;
        self.a2 = (1.0 - alpha / a) / a0;
    }
    pub fn shelf(&mut self, corner: f32, gain_db: f32, high: bool, rate: f32) {
        let a = 10f32.powf(gain_db / 40.0);
        let w = 2.0 * PI * (corner / rate).clamp(1e-4, 0.49);
        let (s, c) = w.sin_cos();
        let alpha = s / std::f32::consts::SQRT_2;
        let k = 2.0 * a.sqrt() * alpha;
        let sign = if high { -1.0 } else { 1.0 };
        let a0 = (a + 1.0) + sign * (a - 1.0) * c + k;
        self.b0 = a * ((a + 1.0) - sign * (a - 1.0) * c + k) / a0;
        self.b1 = sign * 2.0 * a * ((a - 1.0) - sign * (a + 1.0) * c) / a0;
        self.b2 = a * ((a + 1.0) - sign * (a - 1.0) * c - k) / a0;
        self.a1 = -sign * 2.0 * ((a - 1.0) + sign * (a + 1.0) * c) / a0;
        self.a2 = ((a + 1.0) + sign * (a - 1.0) * c - k) / a0;
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
        let rt60 = 0.7f32;
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
    /// Lowest gain any sample still in the look-ahead needs, and how long it is held.
    lim_hold: f32,
    hold_left: usize,
    lim_attack: f32,
    lim_release: f32,
    delay_l: [f32; LOOKAHEAD_MAX],
    delay_r: [f32; LOOKAHEAD_MAX],
    pos: usize,
    look: usize,
}

/// Leveler threshold (dBFS, short-term RMS) and ratio above it.
const LEVEL_THRESHOLD_DB: f32 = -22.0;
const LEVEL_RATIO: f32 = 3.0;
/// Limiter ceiling (linear), ahead of the soft clipper.
const LIMIT: f32 = 0.8;

impl Dynamics {
    pub fn new(rate: f32) -> Self {
        let c = |seconds: f32| 1.0 - (-1.0 / (seconds * rate)).exp();
        let look = ((0.002 * rate) as usize).clamp(1, LOOKAHEAD_MAX);
        Self {
            ms: 0.0,
            // Phrase-scale time constants: held notes and loud passages are
            // evened out, but a consonant after a loud vowel is not ducked.
            ms_coeff: c(0.3),
            gr_db: 0.0,
            lev_attack: c(0.3),
            lev_release: c(0.8),
            lim_gain: 1.0,
            lim_hold: 1.0,
            hold_left: 0,
            // Six time constants inside the look-ahead: the gain is 99.7% of the way down when the
            // loud sample leaves the delay line (three let a sharp burst overshoot the ceiling by 5%).
            lim_attack: c(look as f32 / rate / 6.0),
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
        self.lim_hold = 1.0;
        self.hold_left = 0;
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
        // The target is held for the look-ahead: quieter samples that follow a loud one must not
        // stall the attack (they did, and peaks overshot the ceiling by about 10%).
        let need = (LIMIT / l.abs().max(r.abs()).max(1e-9)).min(1.0);
        if need <= self.lim_hold || self.hold_left == 0 {
            self.lim_hold = need;
            self.hold_left = self.look;
        } else {
            self.hold_left -= 1;
        }
        let k = if self.lim_hold < self.lim_gain { self.lim_attack } else { self.lim_release };
        self.lim_gain += k * (self.lim_hold - self.lim_gain);
        let i = self.pos;
        let (dl, dr) = (self.delay_l[i], self.delay_r[i]);
        self.delay_l[i] = l;
        self.delay_r[i] = r;
        self.pos = if i + 1 >= self.look { 0 } else { i + 1 };
        (dl * self.lim_gain, dr * self.lim_gain)
    }
}

/// Recording chain on the dry voice: microphone distance (proximity bass up
/// close, thinner and quieter far away), a three-band EQ, a compressor and
/// drive (tanh saturation). At the defaults every stage is bypassed, so the
/// voice is untouched.
pub struct Strip {
    prox: Biquad,
    air: Biquad,
    low: Biquad,
    mid: Biquad,
    high: Biquad,
    set: [f32; 6],
    on: [bool; 5],
    level: f32,
    env: f32,
    comp_gain: f32,
    rate: f32,
}

/// Microphone distance at which the chain is neutral.
pub const MIC_NEUTRAL: f32 = 0.4;

impl Strip {
    pub fn new(rate: f32) -> Self {
        Self {
            prox: Biquad::default(),
            air: Biquad::default(),
            low: Biquad::default(),
            mid: Biquad::default(),
            high: Biquad::default(),
            set: [f32::NAN; 6],
            on: [false; 5],
            level: 1.0,
            env: 0.0,
            comp_gain: 1.0,
            rate,
        }
    }

    /// `[mic, low dB, mid dB, high dB, comp, drive]`; filters update only when a value changes.
    pub fn update(&mut self, v: [f32; 6]) {
        if v == self.set {
            return;
        }
        let [mic, low, mid, high, _, _] = v;
        let near = ((MIC_NEUTRAL - mic) / MIC_NEUTRAL).max(0.0);
        let far = ((mic - MIC_NEUTRAL) / (1.0 - MIC_NEUTRAL)).max(0.0);
        // Up close a directional microphone boosts the bass (proximity effect);
        // far away the voice is thinner, duller and quieter.
        let prox_db = 8.0 * near - 4.0 * far;
        self.on[0] = prox_db.abs() > 1e-3;
        if self.on[0] {
            self.prox.shelf(160.0, prox_db, false, self.rate);
        }
        self.on[1] = far > 1e-3;
        if self.on[1] {
            self.air.shelf(5000.0, -4.0 * far, true, self.rate);
        }
        self.level = 10f32.powf((3.0 * near - 6.0 * far) / 20.0);
        self.on[2] = low.abs() > 1e-3;
        if self.on[2] {
            self.low.shelf(220.0, low, false, self.rate);
        }
        self.on[3] = mid.abs() > 1e-3;
        if self.on[3] {
            self.mid.peak(1600.0, 0.8, mid, self.rate);
        }
        self.on[4] = high.abs() > 1e-3;
        if self.on[4] {
            self.high.shelf(5500.0, high, true, self.rate);
        }
        self.set = v;
    }

    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        let mut y = x * self.level;
        if self.on[0] { y = self.prox.process(y); }
        if self.on[1] { y = self.air.process(y); }
        if self.on[2] { y = self.low.process(y); }
        if self.on[3] { y = self.mid.process(y); }
        if self.on[4] { y = self.high.process(y); }
        let comp = self.set[4];
        if comp > 1e-3 {
            // RMS detector (10 ms attack, 150 ms release), threshold falling and
            // ratio rising with the amount; make-up gain restores the level.
            let k = if y * y > self.env { 1.0 - (-1.0 / (0.01 * self.rate)).exp() } else { 1.0 - (-1.0 / (0.15 * self.rate)).exp() };
            self.env += (y * y - self.env) * k;
            let level_db = 10.0 * (self.env + 1e-12).log10();
            let threshold = -14.0 - 16.0 * comp;
            let ratio = 1.0 + 7.0 * comp;
            let over = (level_db - threshold).max(0.0);
            let gain_db = -over * (1.0 - 1.0 / ratio) + 6.0 * comp;
            self.comp_gain = 10f32.powf(gain_db / 20.0);
            y *= self.comp_gain;
        }
        let drive = self.set[5];
        if drive > 1e-3 {
            // Unity gain for quiet signals, peaks rounded off; a little make-up gain.
            let k = 1.0 + 8.0 * drive;
            y = (k * y).tanh() / k * (1.0 + drive);
        }
        y
    }

    pub fn reset(&mut self) {
        for f in [&mut self.prox, &mut self.air, &mut self.low, &mut self.mid, &mut self.high] {
            f.reset();
        }
        self.env = 0.0;
    }
}


#[cfg(test)]
mod limiter_tests {
    #[test]
    fn a_sudden_loud_sine_stays_under_the_ceiling() {
        let mut d = super::Dynamics::new(48000.0);
        let mut peak = 0.0f32;
        for i in 0..48000 {
            let x = if i > 24000 { 2.0 } else { 0.01 } * (i as f32 * 0.05).sin();
            peak = peak.max(d.process(x, x).0.abs());
        }
        assert!(peak <= super::LIMIT * 1.005, "peak {peak}");
    }
}
