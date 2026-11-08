//! Creatures whose sound sources are not a human larynx. Everything here runs at
//! the output rate with fixed-size state (no allocation).
//!
//! * Songbird: a syrinx with two labia, each a self-sustained oscillator (van der
//!   Pol: sinusoidal at low air-sac pressure, richer as it rises), oversampled 4×
//!   so whistles up to ~9 kHz stay accurate. The two sides can sing different
//!   pitches at once. A short trachea (a 4 cm tube), the oropharyngeal cavity (a
//!   resonance that tracks the song's pitch, which is what keeps birdsong tonal)
//!   and the beak (a wider gape passes higher frequencies) shape the sound.
//! * Elephant trumpet: a lip-reed valve at the base of the trunk buzzing into the
//!   trunk, a long tube (a delay line, inverted and low-passed at the open end).
//!   Like the human glottis here, the lips' opening is driven at the pitch (more
//!   sharply when blown harder); the air through them follows Bernoulli against
//!   the trunk's back pressure, so the tube's reflections shape and load the buzz.

use crate::dsp::Biquad;
use crate::params::*;

const TRUNK_MAX: usize = 1024;
const TRACHEA_MAX: usize = 64;
const OVERSAMPLE: usize = 4;

pub const HUMAN: u32 = 0;
pub const SONGBIRD: u32 = 1;
pub const ELEPHANT: u32 = 2;

pub struct Creature {
    rate: f32,
    // Songbird.
    x: [f32; 2],
    v: [f32; 2],
    trachea: [f32; TRACHEA_MAX],
    t_pos: usize,
    oec: Biquad,
    beak_hp: Biquad,
    beak_lp: Biquad,
    // Elephant.
    trunk: [f32; TRUNK_MAX],
    k_pos: usize,
    bell: f32,
    lip_phase: f32,
    bell_hp: Biquad,
    last_filter: [f32; 3],
}

#[inline]
fn smooth(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

impl Creature {
    pub fn new(rate: f32) -> Self {
        Self {
            rate,
            x: [0.01, 0.0],
            v: [0.0; 2],
            trachea: [0.0; TRACHEA_MAX],
            t_pos: 0,
            oec: Biquad::default(),
            beak_hp: Biquad::default(),
            beak_lp: Biquad::default(),
            trunk: [0.0; TRUNK_MAX],
            k_pos: 0,
            bell: 0.0,
            lip_phase: 0.0,
            bell_hp: Biquad::default(),
            last_filter: [f32::NAN; 3],
        }
    }

    pub fn reset(&mut self) {
        *self = Self::new(self.rate);
    }

    /// One output sample of creature `kind` with the voice's parameters.
    #[inline]
    pub fn tick(&mut self, kind: u32, p: &[f32; COUNT]) -> f32 {
        match kind {
            SONGBIRD => self.bird(p),
            ELEPHANT => self.elephant(p),
            _ => 0.0,
        }
    }

    fn bird(&mut self, p: &[f32; COUNT]) -> f32 {
        // A bird sings about three octaves above the slider: 250–1100 Hz → 2–8.8 kHz.
        let f = [p[PITCH] * 8.0, p[PITCH] * 8.0 * (1.0 + p[HARMONY])];
        let drive = p[LOUDNESS] * p[GATE];
        let second = smooth(0.02, 0.1, p[HARMONY]);
        let gape = p[LIP_OPEN];
        if [f[0], gape, 0.0] != self.last_filter {
            self.oec.bandpass(f[0].min(0.45 * self.rate), 4.0, self.rate);
            self.beak_hp.highpass(400.0 + 2500.0 * (1.0 - gape), 0.7, self.rate);
            self.beak_lp.lowpass((3000.0 + 12_000.0 * gape).min(0.45 * self.rate), 0.7, self.rate);
            self.last_filter = [f[0], gape, 0.0];
        }
        // Each labium: x'' − ε(1 − x²)ωx' + ω²x = 0, with ε rising with the air-sac
        // pressure (more pressure: a fuller, buzzier tone).
        let eps = 0.05 + 1.6 * drive * drive;
        let dt = 1.0 / (self.rate * OVERSAMPLE as f32);
        let mut flow = 0.0;
        for k in 0..2 {
            let w = 2.0 * std::f32::consts::PI * f[k];
            let gain = if k == 0 { 1.0 } else { second };
            for _ in 0..OVERSAMPLE {
                let x = self.x[k];
                let a = eps * (1.0 - x * x) * w * self.v[k] - w * w * x;
                self.v[k] += a * dt;
                self.x[k] += self.v[k] * dt;
            }
            if !self.x[k].is_finite() || self.x[k].abs() > 4.0 {
                self.x[k] = 0.01;
                self.v[k] = 0.0;
            }
            // Pressure keeps the labia oscillating; without it they settle.
            if drive < 0.02 {
                self.v[k] *= 0.995;
            }
            flow += gain * smooth(0.0, 0.15, drive) * self.x[k].max(-0.2);
        }
        // Trachea: a 4 cm tube, a little reflection back from the syrinx.
        let delay = ((2.0 * 4.0 / 34_300.0) * self.rate).round().clamp(2.0, (TRACHEA_MAX - 1) as f32) as usize;
        let back = self.trachea[(self.t_pos + TRACHEA_MAX - delay) % TRACHEA_MAX];
        let y = flow - 0.35 * back;
        self.trachea[self.t_pos] = y;
        self.t_pos = (self.t_pos + 1) % TRACHEA_MAX;
        let tonal = 0.75 * self.oec.process(y) + 0.25 * y;
        0.6 * self.beak_lp.process(self.beak_hp.process(tonal))
    }

    fn elephant(&mut self, p: &[f32; COUNT]) -> f32 {
        // The trunk: tract length 11–32 cm on the slider stands for 1.2–2.0 m.
        let trunk_m = 1.2 + 0.8 * ((p[TRACT_LEN] - 11.0) / 21.0).clamp(0.0, 1.0);
        let delay = ((2.0 * trunk_m / 343.0) * self.rate).round().clamp(8.0, (TRUNK_MAX - 1) as f32) as usize;
        if [0.0, 0.0, 1.0] != self.last_filter {
            self.bell_hp.highpass(80.0, 0.7, self.rate);
            self.last_filter = [0.0, 0.0, 1.0];
        }
        let effort = smooth(0.05, 0.6, p[LOUDNESS] * p[GATE]);
        let mouth = 0.9 * effort;
        // The lips buzz at the pitch; blown harder, they snap shut more sharply
        // (the brassy edge of a trumpet call).
        self.lip_phase = (self.lip_phase + p[PITCH] / self.rate).fract();
        let open = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * self.lip_phase).cos());
        let opening = 0.04 + 0.96 * open.powf(1.0 + 3.0 * effort);
        // Pressure coming back up the trunk; the open end inverts it and loses highs.
        let returning = self.trunk[(self.k_pos + TRUNK_MAX - delay) % TRUNK_MAX];
        self.bell += 0.45 * (returning - self.bell);
        let back = -0.9 * self.bell;
        // Air through the lips (Bernoulli) against the trunk's back pressure.
        let across = mouth - back;
        let flow = opening * across.abs().sqrt() * across.signum();
        let outgoing = (0.5 * flow + back).clamp(-2.0, 2.0);
        self.trunk[self.k_pos] = if outgoing.is_finite() { outgoing } else { 0.0 };
        self.k_pos = (self.k_pos + 1) % TRUNK_MAX;
        // What leaves the open end radiates (its changes, not its mean).
        24.0 * self.bell_hp.process(returning - self.bell)
    }
}
