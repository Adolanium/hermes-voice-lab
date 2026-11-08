//! The complete voice: LF glottal source, simplified aerodynamics, the
//! articulatory waveguide, resampling, room and output protection, driven by
//! live parameter changes or a sample-accurate score.

use crate::dsp::{Biquad, Dynamics, Resampler, Rng, Room};
use crate::glottis::LfShape;
use crate::params::{self, *};
use crate::tract::{self, Shape, Waveguide, N, TEETH};

pub const MAX_BLOCK: usize = 4096;
pub const MAX_EVENTS: usize = 65_536;
const CONTROL: u32 = 32;
/// Pitch at which the source level is calibrated (default voice).
const F0_REF: f32 = 210.0;
/// Overall level calibration so the default patch peaks well below 0 dBFS.
const MASTER: f32 = 15.0;
/// Stop-release transient level relative to the frication source.
const BURST_LEVEL: f32 = 0.1;
/// Minimum transglottal pressure (fraction of full lung pressure) for voicing.
const PHONATION_THRESHOLD: f32 = 0.1;
/// Low-frequency sound radiated by the yielding walls of throat and cheeks
/// (the "voice bar" heard during voiced closures).
/// Per-tick sound absorption by a fully developed jet (at full lung pressure).
const JET_LOSS: f32 = 0.12;
const WALL_LEVEL: f32 = 0.025;

#[derive(Clone, Copy, Default)]
pub struct Event {
    pub frame: u64,
    pub order: u32,
    pub param: u8,
    pub value: f32,
    pub tau_ms: f32,
}

/// Telemetry slots exposed to hosts (see `STATE_*`).
pub const STATE_LEN: usize = 20;
pub const STATE_INTERNAL_RATE: usize = 0;
pub const STATE_LENGTH: usize = 1;
pub const STATE_MIN_AREA: usize = 2;
pub const STATE_MIN_INDEX: usize = 3;
pub const STATE_NASAL_AREA: usize = 4;
pub const STATE_ORAL_PRESSURE: usize = 5;
pub const STATE_FRICATION: usize = 6;
pub const STATE_VOICING: usize = 7;
pub const STATE_F0: usize = 8;
pub const STATE_RMS: usize = 9;
pub const STATE_PEAK: usize = 10;
pub const STATE_RD: usize = 11;
pub const STATE_FLOW: usize = 12;
pub const STATE_PLAYING: usize = 13;
pub const STATE_POSITION: usize = 14;
pub const STATE_RESETS: usize = 15;
pub const STATE_ASPIRATION: usize = 16;
pub const STATE_BURST: usize = 17;
pub const STATE_SCORE_LENGTH: usize = 18;
pub const STATE_NOISE_INDEX: usize = 19;

pub struct Voice {
    pub out_rate: f32,
    params: [params::Smoothed; COUNT],
    pub p: [f32; COUNT],
    pub wg: Waveguide,
    pub areas: [f32; N],
    pub shape: Shape,
    int_rate: f32,
    resampler: Resampler,
    room: Room,
    dynamics: Dynamics,
    f0_comp: f32,
    rng: Rng,
    lf: LfShape,
    lf_rd: f32,
    rd_target: f32,
    phase: f64,
    period_scale: f32,
    period_amp: f32,
    vib_phase: f32,
    drift: f32,
    drift_velocity: f32,
    f0: f32,
    oral_pressure: f32,
    closed: bool,
    burst: f32,
    burst_decay: f32,
    burst_gain: f32,
    burst_index: usize,
    burst_filter: Biquad,
    burst_lp: f32,
    frication: f32,
    aspiration: f32,
    voicing_amp: f32,
    leak: f32,
    noise_index: usize,
    noise_gain: f32,
    asp_filter: Biquad,
    fric_filter: Biquad,
    fric_tilt: Biquad,
    flat_filter: Biquad,
    flat_tilt: Biquad,
    flat_lp: f32,
    dc: Biquad,
    counter: u32,
    frac: f32,
    pub out_l: Vec<f32>,
    pub out_r: Vec<f32>,
    pub state: [f32; STATE_LEN],
    flow_now: f32,
    radiation_prev: f32,
    asp_lp: f32,
    fric_lp: f32,
    src_x1: f32,
    src_y1: f32,
    src_r: f32,
    wall_lp1: f32,
    wall_lp2: f32,
    wall_coeff: f32,
    wall_drive: f32,
    sibilant: bool,
    tilt_coeff: f32,
    sum_sq: f32,
    sum_n: u32,
    peak: f32,
    resets: u32,
    // Score player.
    pub staging: Vec<f32>,
    events: Vec<Event>,
    next_event: usize,
    playing: bool,
    looping: bool,
    start_frame: u64,
    end_frame: u64,
    frame: u64,
}

impl Voice {
    pub fn new(out_rate: f32, seed: u32) -> Self {
        let out_rate = if out_rate.is_finite() { out_rate.clamp(8000.0, 192_000.0) } else { 48_000.0 };
        let mut params_arr = [params::Smoothed::new(0.0, 10.0); COUNT];
        let mut p = [0.0; COUNT];
        for i in 0..COUNT {
            params_arr[i] = params::Smoothed::new(SPECS[i].default, SPECS[i].tau_ms);
            p[i] = SPECS[i].default;
        }
        let mut v = Self {
            out_rate,
            params: params_arr,
            p,
            wg: Waveguide::new(),
            areas: [1.0; N],
            shape: Shape::default(),
            int_rate: 100_000.0,
            resampler: Resampler::new(out_rate),
            room: Room::new(out_rate),
            dynamics: Dynamics::new(out_rate),
            f0_comp: 1.0,
            rng: Rng::new(seed),
            lf: LfShape::from_rd(1.5),
            lf_rd: 1.5,
            rd_target: 1.5,
            phase: 0.0,
            period_scale: 1.0,
            period_amp: 1.0,
            vib_phase: 0.0,
            drift: 0.0,
            drift_velocity: 0.0,
            f0: 210.0,
            oral_pressure: 0.0,
            closed: false,
            burst: 0.0,
            burst_decay: 0.999,
            burst_gain: 0.0,
            burst_index: N - 1,
            burst_filter: Biquad::default(),
            burst_lp: 0.0,
            frication: 0.0,
            aspiration: 0.0,
            voicing_amp: 0.0,
            leak: 0.05,
            noise_index: N - 1,
            noise_gain: 1.0,
            asp_filter: Biquad::default(),
            fric_filter: Biquad::default(),
            fric_tilt: Biquad::default(),
            flat_filter: Biquad::default(),
            flat_tilt: Biquad::default(),
            flat_lp: 0.0,
            dc: Biquad::default(),
            counter: 0,
            frac: 0.0,
            out_l: vec![0.0; MAX_BLOCK],
            out_r: vec![0.0; MAX_BLOCK],
            state: [0.0; STATE_LEN],
            flow_now: 0.0,
            radiation_prev: 0.0,
            asp_lp: 0.0,
            fric_lp: 0.0,
            src_x1: 0.0,
            src_y1: 0.0,
            src_r: 0.998,
            wall_lp1: 0.0,
            wall_lp2: 0.0,
            wall_coeff: 0.02,
            wall_drive: 0.0,
            sibilant: false,
            tilt_coeff: 0.05,
            sum_sq: 0.0,
            sum_n: 0,
            peak: 0.0,
            resets: 0,
            staging: vec![0.0; MAX_EVENTS * 4],
            events: Vec::with_capacity(MAX_EVENTS),
            next_event: 0,
            playing: false,
            looping: false,
            start_frame: 0,
            end_frame: 0,
            frame: 0,
        };
        v.dc.highpass(35.0, 0.707, out_rate);
        v.control();
        v
    }

    pub fn set(&mut self, id: usize, value: f32, tau_ms: f32) {
        if id >= COUNT || !value.is_finite() {
            return;
        }
        let tau = if tau_ms.is_finite() && tau_ms >= 0.0 { tau_ms } else { SPECS[id].tau_ms };
        self.params[id].set(params::clamp(id, value), tau);
    }

    pub fn jump(&mut self, id: usize, value: f32) {
        if id < COUNT && value.is_finite() {
            let v = params::clamp(id, value);
            self.params[id].jump(v);
            self.p[id] = v;
        }
    }

    pub fn target(&self, id: usize) -> f32 {
        self.params.get(id).map(|p| p.target).unwrap_or(0.0)
    }

    /// Recompute everything that changes at control rate.
    fn control(&mut self) {
        let dt = CONTROL as f32 / self.int_rate;
        for i in 0..COUNT {
            self.params[i].step(dt);
            self.p[i] = params::clamp(i, self.params[i].value);
        }
        let p = &self.p;
        self.shape = tract::area_function(p, &mut self.areas);
        self.int_rate = tract::internal_rate(self.shape.length_cm);
        self.resampler.design(self.int_rate);
        // Jet losses use the previous step's pressure (one control period behind).
        let jet_speed = self.oral_pressure.max(0.0).sqrt() * smooth(0.6, 0.08, self.shape.min_area);
        self.wg.jet_at = self.shape.min_index;
        self.wg.jet_loss = JET_LOSS * jet_speed;
        self.wg.set_areas_ramped(&self.areas, self.shape.nasal_area, self.int_rate, CONTROL);

        // Aerodynamics: two orifices in series (glottis, supraglottal path).
        let lung = p[LOUDNESS].powf(1.25) * p[GATE];
        let voicing = p[VOICING];
        // Mean glottal area (cm²): ~0.05 while phonating, ~0.35 fully
        // abducted for voiceless consonants.
        let glottal_area = 0.045 + 0.3 * (1.0 - voicing).powf(1.5) + 0.07 * p[BREATH];
        let path = self.shape.path_area.max(1e-3);
        let inv_g = 1.0 / (glottal_area * glottal_area);
        let inv_p = 1.0 / (path * path);
        let target = lung * inv_p / (inv_g + inv_p);
        // Pressure behind a constriction rises as glottal flow fills the
        // cavity (and its yielding walls): slowly through adducted, vibrating
        // folds, quickly through an open glottis. Release is fast.
        let tau = if target > self.oral_pressure { 0.004 + 0.0035 / glottal_area } else { 0.005 };
        self.oral_pressure += (target - self.oral_pressure) * (1.0 - (-dt / tau).exp());
        let po = self.oral_pressure.max(0.0);

        // Stop release: an abrupt opening after pressure has built up.
        let closed = self.shape.path_area < 0.004;
        if self.closed && !closed && po > 0.12 {
            self.burst = (po * 1.6).min(2.0);
            // Fresh filter state: the response type changes with place.
            self.burst_filter.reset();
            self.burst_lp = 0.0;
            // The transient is shaped by the cavity in front of the release:
            // none for the lips (weak, flat), a short one for the tongue tip
            // (high, rising), a longer one for the dorsum (compact, mid).
            // It is injected just in front of the release point.
            let (kind, decay_ms) = if self.shape.min_index >= N - 3 {
                self.burst_filter.lowpass(4500.0, 0.6, self.int_rate);
                self.burst_index = N - 1;
                (0.35, 3.5)
            } else if p[TIP_CLOSE] >= p[DORSUM_CLOSE] {
                self.burst_filter.highpass(3200.0, 0.75, self.int_rate);
                self.burst_index = TEETH;
                (1.0, 4.5)
            } else {
                // Compact peak at the front-cavity resonance: low before back
                // vowels (dorsum far back), high before front vowels.
                self.burst_filter.bandpass(1200.0 + 1800.0 * p[TONGUE_X], 1.4, self.int_rate);
                self.burst_index = (self.shape.min_index + 1).min(N - 1);
                (6.0, 9.0)
            };
            self.burst_gain = kind;
            self.burst_decay = (-1.0 / (decay_ms * 1e-3 * self.int_rate)).exp();
        }
        self.closed = closed;

        // A jet becomes turbulent once its Reynolds number (∝ √(A·ΔP))
        // passes a critical value; above it the dipole source strength goes
        // as U³/A^2.5 = √A·ΔP^1.5 (Stevens 1971). So, for the same lung
        // pressure, a narrow constriction that takes most of the pressure
        // drop is far noisier than a vowel constriction behind an open glottis.
        let ac = self.shape.min_area.max(1e-3);
        let re2 = ac * po;
        self.frication = smooth(0.004, 0.02, re2) * 5.0 * ac.sqrt() * po * po.sqrt();
        if self.shape.coronal {
            self.noise_index = TEETH;
            // A postalveolar channel feeds a long, rounded front cavity whose
            // strong low resonance needs less source to sound as loud.
            self.noise_gain = 1.15 - 0.59 * smooth(0.18, 0.85, p[TIP_PLACE]);
        } else {
            self.noise_index = (self.shape.min_index + 1).min(N - 1);
            self.noise_gain = if self.shape.min_index >= N - 3 { 0.9 } else { 0.19 };
        }
        let drop = (lung - po).max(0.0);
        // Aspiration: the same law at the glottis. While the folds vibrate
        // the mean opening is too small for a turbulent jet (breathiness is
        // added per cycle in tick()).
        let ug2 = glottal_area * drop;
        self.aspiration = smooth(0.04, 0.1, ug2) * 4.2 * glottal_area.sqrt() * drop * drop.sqrt();
        let adduction = smooth(0.2, 0.75, voicing);
        // The folds only vibrate above a phonation-threshold pressure drop, so
        // voicing stops cleanly when the lungs relax at a pause or when
        // pressure behind a voiced closure has built up.
        self.voicing_amp = adduction * drop.sqrt() * smooth(PHONATION_THRESHOLD, 2.5 * PHONATION_THRESHOLD, drop);
        self.leak = 0.03 + 0.24 * p[BREATH];

        // Fricative noise colour: brighter and narrower for sibilants.
        // Sibilants: a jet striking the teeth gives a band-limited, high
        // spectrum (lower and wider for postalveolar). Other fricatives are
        // broadband and weak.
        // Each colour has its own filter state (re-purposing one filter's
        // state for another response would ring when the source moves).
        self.sibilant = self.noise_index == TEETH;
        let center = 7600.0 - 4000.0 * p[TIP_PLACE];
        self.fric_filter.bandpass(center, 1.1, self.int_rate);
        self.fric_tilt.highpass(center * 0.55, 0.7, self.int_rate);
        self.flat_filter.bandpass(3800.0, 0.5, self.int_rate);
        self.flat_tilt.lowpass(11_000.0, 0.6, self.int_rate);
        self.asp_filter.bandpass(1800.0, 0.35, self.int_rate);
        self.tilt_coeff = 1.0 - (-2.0 * std::f32::consts::PI * 1400.0 / self.int_rate).exp();
        self.src_r = (-2.0 * std::f32::consts::PI * 40.0 / self.int_rate).exp();
        self.wall_coeff = 1.0 - (-2.0 * std::f32::consts::PI * 350.0 / self.int_rate).exp();

        // Voice quality: tenseness and effort lower Rd (brighter, firmer).
        let rd = 1.8 - 2.0 * p[TENSENESS] - 0.4 * (p[LOUDNESS] - 0.6);
        self.rd_target = rd.clamp(0.3, 2.7);

        // Pitch with vibrato and slow drift (cents).
        let h = p[HUMANIZE];
        self.vib_phase = (self.vib_phase + p[VIB_RATE] * (1.0 + 0.04 * h * self.drift) * dt).fract();
        let vib = p[VIB_DEPTH] * 85.0 * (2.0 * std::f32::consts::PI * self.vib_phase).sin();
        self.drift_velocity += (self.rng.gauss() * 0.9 - self.drift_velocity) * (dt * 4.0).min(1.0);
        self.drift += (self.drift_velocity - self.drift) * (dt * 1.8).min(1.0);
        let cents = vib + 14.0 * h * self.drift;
        self.f0 = p[PITCH] * 2f32.powf(cents / 1200.0);
        // Radiated level grows with the rate of flow change, i.e. with f0 for a
        // fixed flow pulse. Stiffer, thinner folds at high pitch pass smaller
        // pulses: at constant effort the peak flow derivative (hence level)
        // stays roughly constant with pitch.
        self.f0_comp = (F0_REF / self.f0.max(1.0)).powf(1.0).clamp(0.35, 1.4);
    }

    #[inline]
    fn tick(&mut self) -> f32 {
        if self.counter % CONTROL == 0 {
            self.control();
        }
        self.counter = self.counter.wrapping_add(1);
        let f0 = self.f0 * self.period_scale;
        self.phase += (f0 / self.int_rate) as f64;
        if self.phase >= 1.0 {
            self.phase -= self.phase.floor();
            let h = self.p[HUMANIZE];
            self.period_scale = 1.0 + 0.0065 * h * self.rng.gauss();
            self.period_amp = 1.0 + 0.055 * h * self.rng.gauss();
            if (self.rd_target - self.lf_rd).abs() > 0.008 {
                self.lf_rd = self.rd_target;
                self.lf = LfShape::from_rd(self.lf_rd as f64);
            }
        }
        let flow = self.lf.flow(self.phase) as f32;
        self.flow_now = flow;
        let pulse = flow * (1.0 - self.leak) + self.leak;
        let glottal = self.voicing_amp * self.f0_comp * self.period_amp * pulse;
        let white = self.rng.uniform();
        // Noise sources are pre-tilted (one-pole low-pass) so that, after the
        // radiation derivative, their spectra fall off as real turbulence does.
        self.asp_lp += self.tilt_coeff * (self.asp_filter.process(white) - self.asp_lp);
        let asp = self.asp_lp * 6.0
            * (self.p[BREATH] * self.p[BREATH] * 0.02 * self.voicing_amp * (0.1 + flow) + self.aspiration * 0.022);
        // The waveguide carries only the acoustic (AC) part of the glottal
        // flow; mean airflow is handled by the quasi-static aerodynamics.
        // Without this, DC flow would stop and restart abruptly at every
        // closure, which radiates as a click, and pile up behind a closure.
        let raw = glottal * 0.9 + asp;
        let source = raw - self.src_x1 + self.src_r * self.src_y1;
        self.wall_drive = source;
        self.src_x1 = raw;
        self.src_y1 = source;

        let mut fric = 0.0;
        let mut burst = 0.0;
        if self.frication > 0.0 {
            let white = self.rng.uniform();
            let sib = self.fric_tilt.process(self.fric_filter.process(white));
            let flat = self.flat_tilt.process(self.flat_filter.process(white));
            // Pre-tilt so the radiation derivative leaves the intended shape.
            self.fric_lp += self.tilt_coeff * (sib - self.fric_lp);
            self.flat_lp += self.tilt_coeff * (flat - self.flat_lp);
            // The obstacle source's strength should not depend on how far the
            // tip profile happens to narrow the section at the teeth (which
            // varies with the vowel context), so normalise the injection there.
            let n = if self.sibilant {
                self.fric_lp * 9.0 * 0.85 / self.wg.injection_scale(TEETH).max(0.3)
            } else {
                self.flat_lp * 5.0
            };
            fric = n * self.frication * 0.05 * self.noise_gain;
        }
        if self.burst > 1e-4 {
            let shaped = self.burst_filter.process(self.rng.uniform());
            self.burst_lp += self.tilt_coeff * (shaped - self.burst_lp);
            burst = self.burst_lp * self.burst * self.burst_gain * BURST_LEVEL;
            self.burst *= self.burst_decay;
        }
        // The open glottis absorbs more energy than the closed one.
        self.wg.glottal_reflection = 0.92 - 0.45 * flow * self.voicing_amp.min(1.0) - 0.7 * (1.0 - self.p[VOICING]);
        let (mouth, nose) = self.wg.tick(source, self.noise_index, fric, self.burst_index, burst);
        let flow = mouth + nose;
        let radiated = flow - self.radiation_prev;
        self.radiation_prev = flow;
        // Wall radiation: the yielding throat and cheek walls are driven by
        // the glottal pulses and, being massive, radiate only low
        // frequencies. Masked while the mouth is open, it is the voice bar
        // heard through voiced closures.
        self.wall_lp1 += self.wall_coeff * (self.wall_drive - self.wall_lp1);
        self.wall_lp2 += self.wall_coeff * (self.wall_lp1 - self.wall_lp2);
        radiated + WALL_LEVEL * self.wall_lp2
    }

    /// Render `count` output frames into out_l/out_r.
    pub fn render(&mut self, count: usize) -> usize {
        let count = count.min(MAX_BLOCK);
        for n in 0..count {
            self.advance_score();
            let step = self.int_rate / self.out_rate;
            self.frac += step;
            while self.frac >= 1.0 {
                self.frac -= 1.0;
                let y = self.tick();
                self.resampler.push(y);
            }
            let raw = self.resampler.read(self.frac);
            let gain = self.p[GAIN];
            let dry = self.dc.process(raw) * MASTER * gain * gain * 1.6;
            let space = self.p[SPACE];
            let (wl, wr) = self.room.process(dry * space);
            let (l, r) = (dry + 0.5 * wl, dry + 0.5 * wr);
            let (l, r) = if l.is_finite() && r.is_finite() {
                let (l, r) = self.dynamics.process(l, r);
                (soft_clip(l), soft_clip(r))
            } else {
                self.recover();
                (0.0, 0.0)
            };
            self.out_l[n] = l;
            self.out_r[n] = r;
            self.sum_sq += l * l;
            self.sum_n += 1;
            self.peak = self.peak.max(l.abs());
            self.frame += 1;
        }
        self.update_state();
        count
    }

    fn recover(&mut self) {
        self.wg.reset();
        self.resampler.reset();
        self.room.reset();
        self.dynamics.reset();
        self.dc.reset();
        self.asp_filter.reset();
        self.fric_filter.reset();
        self.fric_tilt.reset();
        self.flat_filter.reset();
        self.flat_tilt.reset();
        self.flat_lp = 0.0;
        self.burst_filter.reset();
        self.burst_lp = 0.0;
        self.src_x1 = 0.0;
        self.src_y1 = 0.0;
        self.wall_lp1 = 0.0;
        self.wall_lp2 = 0.0;
        self.oral_pressure = 0.0;
        self.burst = 0.0;
        self.resets += 1;
    }

    fn update_state(&mut self) {
        let s = &mut self.state;
        s[STATE_INTERNAL_RATE] = self.int_rate;
        s[STATE_LENGTH] = self.shape.length_cm;
        s[STATE_MIN_AREA] = self.shape.min_area;
        s[STATE_MIN_INDEX] = self.shape.min_index as f32;
        s[STATE_NASAL_AREA] = self.shape.nasal_area;
        s[STATE_ORAL_PRESSURE] = self.oral_pressure;
        s[STATE_FRICATION] = self.frication;
        s[STATE_VOICING] = self.voicing_amp;
        s[STATE_F0] = self.f0;
        if self.sum_n > 0 {
            s[STATE_RMS] = (self.sum_sq / self.sum_n as f32).sqrt();
        }
        s[STATE_PEAK] = self.peak;
        self.sum_sq = 0.0;
        self.sum_n = 0;
        self.peak = 0.0;
        s[STATE_RD] = self.lf_rd;
        s[STATE_FLOW] = self.flow_now;
        s[STATE_PLAYING] = if self.playing { 1.0 } else { 0.0 };
        s[STATE_POSITION] = if self.playing { (self.frame - self.start_frame) as f32 / self.out_rate } else { 0.0 };
        s[STATE_RESETS] = self.resets as f32;
        s[STATE_ASPIRATION] = self.aspiration;
        s[STATE_BURST] = self.burst;
        s[STATE_SCORE_LENGTH] = self.end_frame as f32 / self.out_rate;
        s[STATE_NOISE_INDEX] = self.noise_index as f32;
    }

    // ---- Score -----------------------------------------------------------

    /// Parse `count` events from the staging buffer: [seconds, param, value, tau_ms].
    /// Events are sorted by time; ties keep submission order. No allocation.
    pub fn load_score(&mut self, count: usize, length_seconds: f32) -> usize {
        let count = count.min(MAX_EVENTS);
        self.events.clear();
        let mut last = 0u64;
        for i in 0..count {
            let t = self.staging[i * 4];
            let param = self.staging[i * 4 + 1];
            let value = self.staging[i * 4 + 2];
            let tau = self.staging[i * 4 + 3];
            if !(t.is_finite() && t >= 0.0 && t <= 3600.0 && param >= 0.0 && (param as usize) < COUNT && value.is_finite()) {
                continue;
            }
            let frame = (t as f64 * self.out_rate as f64).round() as u64;
            last = last.max(frame);
            self.events.push(Event { frame, order: i as u32, param: param as u8, value, tau_ms: if tau.is_finite() { tau } else { -1.0 } });
        }
        self.events.sort_unstable_by(|a, b| a.frame.cmp(&b.frame).then(a.order.cmp(&b.order)));
        let length = if length_seconds.is_finite() && length_seconds > 0.0 {
            (length_seconds as f64 * self.out_rate as f64) as u64
        } else {
            last + (0.3 * self.out_rate) as u64
        };
        self.end_frame = length.max(1);
        self.next_event = 0;
        self.playing = false;
        self.events.len()
    }

    pub fn play_score(&mut self, looping: bool) {
        self.next_event = 0;
        self.start_frame = self.frame;
        self.playing = !self.events.is_empty();
        self.looping = looping;
    }

    pub fn stop_score(&mut self) {
        self.playing = false;
        self.set(GATE, 0.0, 25.0);
    }

    fn advance_score(&mut self) {
        if !self.playing {
            return;
        }
        let local = self.frame - self.start_frame;
        while self.next_event < self.events.len() && self.events[self.next_event].frame <= local {
            let e = self.events[self.next_event];
            self.next_event += 1;
            if e.tau_ms == 0.0 {
                self.jump(e.param as usize, e.value);
            } else {
                self.set(e.param as usize, e.value, e.tau_ms);
            }
        }
        if local >= self.end_frame {
            if self.looping {
                self.next_event = 0;
                self.start_frame = self.frame;
            } else {
                self.stop_score();
            }
        }
    }

    pub fn is_playing(&self) -> bool {
        self.playing
    }

    /// Sample the current LF flow shape at `out.len()` phases (display).
    pub fn glottal_shape(&self, out: &mut [f32]) {
        let n = out.len().max(1);
        for (i, v) in out.iter_mut().enumerate() {
            *v = self.lf.flow(i as f64 / n as f64) as f32;
        }
    }
}

#[inline]
fn smooth(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[inline]
fn soft_clip(x: f32) -> f32 {
    let a = x.abs();
    if a <= 0.7 {
        x
    } else {
        (0.7 + 0.3 * ((a - 0.7) / 0.3).tanh()).copysign(x)
    }
}
