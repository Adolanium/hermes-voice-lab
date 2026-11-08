//! The complete voice: lungs, a vibrating glottis, the airway (a lossy
//! acoustic transmission line carrying both airflow and sound), turbulence
//! noise driven by the actual flow, resampling, room and output protection,
//! driven by live parameter changes or a sample-accurate score.

use crate::airway::{self, Airway};
use crate::dsp::{Biquad, Dynamics, Resampler, Rng, Room};
use crate::params::{self, *};
use crate::tract::{self, Shape, N, TEETH};

pub const MAX_BLOCK: usize = 4096;
pub const MAX_EVENTS: usize = 65_536;
const CONTROL: u32 = 32;
/// Overall level calibration so the default patch peaks well below 0 dBFS.
const MASTER: f32 = 15.0;
/// Radiated pressure per unit rate of change of outflow (cm³/s²), before MASTER.
const RADIATE: f64 = 2.5e-8;
/// Share of the soft walls' volume velocity that radiates through the skin.
const WALL_RADIATION: f64 = 0.05;
/// Lung pressure at full effort (dyn/cm²; ≈10 cmH₂O).
const LUNG_FULL: f32 = 10_000.0;
/// Transglottal pressure needed to set the folds vibrating (≈2.5 cmH₂O).
const PHONATION_THRESHOLD: f32 = 2_450.0;
/// Posterior gap of the glottis that never closes (cm²).
const CHINK: f32 = 0.012;
/// Peak vibratory opening of the glottis at default effort (cm²).
const GLOTTIS_SWING: f32 = 0.11;
/// Turbulence: critical and saturating Reynolds numbers, and source gains
/// (dyn/cm² per (Re² − Re_c²)) for the constriction jet, the jet striking
/// the teeth (sibilants) and the glottis (aspiration).
const RE_CRITICAL: f64 = 1_800.0;
const RE_SATURATE: f64 = 12_000.0;
const GAIN_JET: f64 = 4.0e-6;
const GAIN_TEETH: f64 = 9.0e-6;
const GAIN_GLOTTIS: f64 = 3.0e-6;
/// Turbulence starts about 1 cm downstream of the constriction's exit.
const JET_OFFSET_CM: f64 = 1.0;

#[derive(Clone, Copy, Default)]
pub struct Event {
    pub frame: u64,
    pub order: u32,
    pub param: u8,
    pub value: f32,
    pub tau_ms: f32,
}

/// Telemetry slots exposed to hosts (see `STATE_*`).
pub const STATE_LEN: usize = 23;
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
/// Mean airflow through the tract, normalized (≈0.15 for a voiced vowel, ≈1 for /h/).
pub const STATE_AIRFLOW: usize = 20;
/// Share of the airflow leaving through the nose (0..1).
pub const STATE_NASAL_SHARE: usize = 21;
/// 1 when no air can leave the body (tract sealed, nose shut).
pub const STATE_CLOSED: usize = 22;
/// Sections reported by `energy` (oral, then nasal).
pub const ENERGY_LEN: usize = N + crate::tract::NASAL_N;
/// Points in the captured glottal-flow cycle (display).
const PULSE_POINTS: usize = 96;
/// Twang: the narrowed epilarynx tube's length (cm) and area (cm²).
const TWANG_LENGTH: f32 = 2.4;
const TWANG_AREA: f32 = 0.5;
/// Twang: how far the larynx rises (cm).
const TWANG_RAISE: f32 = 1.0;
/// Trill: flapping rate (Hz) of a tongue tip, lips or uvula in the airflow,
/// and the area (cm²) the constriction opens to between contacts.
const TRILL_HZ: f32 = 27.0;
const TRILL_OPEN: f32 = 0.25;
/// Ejectives: the fraction of the pharynx's cross-section the rising larynx
/// takes up as it rises (tuned so an ejective's release is about as strong as
/// a plain stop's, ~10× its release without the rise).
const LARYNX_SQUEEZE: f32 = 0.3;
/// Clicks: how far the cavity between two oral seals widens as the tongue
/// body pulls down.
const SUCTION_EXPAND: f32 = 0.25;
/// An oral section narrower than this (cm²) counts as a seal for a click.
const CLICK_SEAL: f32 = 0.03;

/// Glottal opening over one cycle (0..1): a raised-cosine opening, then a
/// closing that is smooth for a lax voice and steepens toward the moment of
/// contact for a pressed one; closed for the rest of the cycle.
#[inline]
pub fn glottal_pulse(phase: f32, open_quotient: f32, speed_quotient: f32, sharpness: f32) -> f32 {
    let t_open = open_quotient * speed_quotient / (1.0 + speed_quotient);
    if phase < t_open {
        0.5 * (1.0 - (std::f32::consts::PI * phase / t_open).cos())
    } else if phase < open_quotient {
        let x = (phase - t_open) / (open_quotient - t_open);
        let soft = 0.5 * (1.0 + (std::f32::consts::PI * x).cos());
        let firm = (0.5 * std::f32::consts::PI * x).cos();
        soft + (firm - soft) * sharpness
    } else {
        0.0
    }
}

pub struct Voice {
    pub out_rate: f32,
    params: [params::Smoothed; COUNT],
    pub p: [f32; COUNT],
    pub airway: Airway,
    pub areas: [f32; N],
    pub shape: Shape,
    int_rate: f32,
    resampler: Resampler,
    room: Room,
    dynamics: Dynamics,
    rng: Rng,
    phase: f32,
    /// Alternates every glottal cycle (fry and growl pair the pulses).
    odd_cycle: bool,
    /// Phase of the ventricular folds, which flap at half the pitch in a growl.
    ventricular_phase: f32,
    /// Phase of a trilling articulator.
    trill_phase: f32,
    period_scale: f32,
    period_amp: f32,
    vib_phase: f32,
    drift: f32,
    drift_velocity: f32,
    f0: f32,
    // Glottis and lungs.
    lungs: f64,
    d_lungs: f64,
    abduction: f32,
    swing: f32,
    open_quotient: f32,
    speed_quotient: f32,
    sharpness: f32,
    transglottal: f32,
    /// Breath plus the falsetto gap: drives the glottal aspiration.
    breathiness: f32,
    voicing_amp: f32,
    glottal_area: f32,
    pulse: [f32; PULSE_POINTS],
    // Noise.
    jet_branch: usize,
    jet_at: usize,
    jet_filter: Biquad,
    jet_tilt: Biquad,
    teeth_filter: Biquad,
    teeth_tilt: Biquad,
    teeth_weight: f64,
    jet_weight: f64,
    asp_filter: Biquad,
    /// One-pole pre-tilt states: the radiation derivative adds +6 dB/octave,
    /// real turbulence falls off above a few kHz.
    tilt: [f64; 3],
    tilt_coeff: f64,
    frication: f32,
    aspiration: f32,
    // Output.
    out_prev: f64,
    dc: Biquad,
    counter: u32,
    frac: f32,
    pub out_l: Vec<f32>,
    pub out_r: Vec<f32>,
    pub state: [f32; STATE_LEN],
    /// Smoothed sound-pressure amplitude per section, for display.
    pub energy: [f32; ENERGY_LEN],
    pressure_dc: [f32; ENERGY_LEN],
    airflow: f32,
    mouth_mean: f32,
    nose_mean: f32,
    nasal_share: f32,
    oral_pressure: f32,
    closed: bool,
    /// A parameter jumped: install the next shape at once (no air pumping).
    snap: bool,
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
            airway: Airway::new(),
            areas: [1.0; N],
            shape: Shape::default(),
            int_rate: 100_000.0,
            resampler: Resampler::new(out_rate),
            room: Room::new(out_rate),
            dynamics: Dynamics::new(out_rate),
            rng: Rng::new(seed),
            phase: 0.0,
            odd_cycle: false,
            ventricular_phase: 0.0,
            trill_phase: 0.0,
            period_scale: 1.0,
            period_amp: 1.0,
            vib_phase: 0.0,
            drift: 0.0,
            drift_velocity: 0.0,
            f0: 210.0,
            lungs: 0.0,
            d_lungs: 0.0,
            abduction: CHINK,
            swing: 0.0,
            open_quotient: 0.65,
            speed_quotient: 1.8,
            sharpness: 0.3,
            transglottal: 0.0,
            breathiness: 0.25,
            voicing_amp: 0.0,
            glottal_area: 0.0,
            pulse: [0.0; PULSE_POINTS],
            jet_branch: N,
            jet_at: N,
            jet_filter: Biquad::default(),
            jet_tilt: Biquad::default(),
            teeth_filter: Biquad::default(),
            teeth_tilt: Biquad::default(),
            teeth_weight: 0.0,
            jet_weight: 1.0,
            asp_filter: Biquad::default(),
            tilt: [0.0; 3],
            tilt_coeff: 0.05,
            frication: 0.0,
            aspiration: 0.0,
            out_prev: 0.0,
            dc: Biquad::default(),
            counter: 0,
            frac: 0.0,
            out_l: vec![0.0; MAX_BLOCK],
            out_r: vec![0.0; MAX_BLOCK],
            state: [0.0; STATE_LEN],
            energy: [0.0; ENERGY_LEN],
            pressure_dc: [0.0; ENERGY_LEN],
            airflow: 0.0,
            mouth_mean: 0.0,
            nose_mean: 0.0,
            nasal_share: 0.0,
            oral_pressure: 0.0,
            closed: false,
            snap: true,
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
        let (areas, nasal) = (v.areas, v.shape.nasal_area);
        v.airway.set_areas_ramped(&areas, nasal, 0);
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
            self.snap = true;
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
        let p = self.p;
        // A twang raises the larynx: a shorter tract and a pharynx that is wide
        // next to the narrowed epilarynx tube (see `larynx`).
        let mut tract_p = p;
        tract_p[TRACT_LEN] = params::clamp(TRACT_LEN, p[TRACT_LEN] - TWANG_RAISE * p[TWANG]);
        tract_p[THROAT] = params::clamp(THROAT, p[THROAT] + 0.3 * p[TWANG]);
        self.shape = tract::area_function(&tract_p, &mut self.areas);
        self.larynx(&p, dt);
        self.int_rate = airway::internal_rate(self.shape.length_cm);
        self.resampler.design(self.int_rate);
        self.airway.set_length(self.shape.length_cm);
        // A jump (score start, preset load) installs the shape at once; the
        // walls did not move, so it must not pump air.
        let ticks = if self.snap { 0 } else { CONTROL };
        self.snap = false;
        self.airway.set_areas_ramped(&self.areas, self.shape.nasal_area, ticks);

        // Lungs: ramp to the new pressure over the control period (a stepped
        // pressure would buzz at the control rate).
        let lungs = (LUNG_FULL * p[LOUDNESS].powf(1.25) * p[GATE]) as f64;
        self.d_lungs = (lungs - self.lungs) / CONTROL as f64;

        // Glottis: resting (abducted) area and vibratory swing. Voiceless
        // consonants pull the folds apart; breathiness widens the gap.
        let voicing = p[VOICING];
        self.abduction = CHINK + 0.34 * (1.0 - voicing).powf(1.5) + 0.05 * p[BREATH];
        // The folds vibrate only when adducted and when the pressure across
        // them is above threshold: they stop at a pause, and when pressure
        // builds behind a voiced closure.
        let across = (self.lungs as f32 - self.airway.p[0] as f32).max(0.0);
        self.transglottal += (across - self.transglottal) * (1.0 - (-dt / 0.006).exp());
        let adduction = smooth(0.2, 0.75, voicing) * (1.0 - smooth(0.12, 0.3, self.abduction));
        // Folds pressed shut (a glottal stop) do not vibrate.
        let target_amp = adduction * smooth(PHONATION_THRESHOLD, 1.8 * PHONATION_THRESHOLD, self.transglottal) * (1.0 - p[GLOTTAL]);
        // Oscillation builds up and dies away over a few cycles.
        let k = if target_amp > self.voicing_amp { 1.0 - (-dt / 0.008).exp() } else { 1.0 - (-dt / 0.005).exp() };
        self.voicing_amp += (target_amp - self.voicing_amp) * k;
        // Thinner, stiffer folds at high pitch open less; more effort opens more.
        self.swing = GLOTTIS_SWING * (0.55 + 0.65 * p[LOUDNESS]) * (210.0 / self.f0.max(60.0)).powf(0.35).clamp(0.6, 1.5);
        // Voice quality: tenseness shortens the open phase, skews it and makes
        // the closure firmer.
        let t = p[TENSENESS];
        self.open_quotient = (0.82 - 0.4 * t + 0.1 * p[BREATH]).clamp(0.35, 0.95);
        self.speed_quotient = 1.4 + 1.6 * t;
        self.sharpness = (0.1 + 0.75 * t).clamp(0.0, 1.0);
        // Falsetto: only the thin edges of the folds vibrate, so the pulse is
        // smooth and symmetric, its swing small, and the folds never close
        // fully (a posterior gap leaks air).
        let r = p[REGISTER];
        self.open_quotient += (0.92 - self.open_quotient) * r;
        self.speed_quotient += (1.0 - self.speed_quotient) * r;
        self.sharpness *= 1.0 - r;
        self.swing *= 1.0 - 0.3 * r;
        self.abduction += 0.035 * r;
        self.breathiness = (p[BREATH] + 0.35 * r).min(1.0);
        // Vocal fry: thick, slack folds open briefly.
        self.open_quotient *= 1.0 - 0.45 * p[FRY];
        // A twang is sung with firmly adducted folds: a shorter open phase and a
        // sharper closure, so more high harmonics reach the narrowed epilarynx.
        let tw = p[TWANG];
        self.open_quotient *= 1.0 - 0.15 * tw;
        self.sharpness = (self.sharpness + 0.4 * tw).min(1.0);

        // Turbulence sources: where the jet is, and whether it hits the teeth.
        self.jet_at = self.shape.min_index;
        // The jet leaves the narrowest section through its downstream branch.
        self.jet_branch = (self.shape.min_index + 1).min(N);
        let offset = (JET_OFFSET_CM / self.airway.dx).round() as usize;
        self.jet_at = (self.jet_branch + offset).min(N);
        // A coronal channel aims its jet at the incisors: the obstacle source
        // dominates sibilants. Weighted by how narrow the channel is.
        // The shorter jet of an alveolar groove strikes the incisors harder
        // than the wider postalveolar one, so /s/ is about as loud as /ʃ/.
        let place = 5.0 - 5.6 * p[TIP_PLACE];
        // Air escaping around the sides of the tongue (/l/) does not strike the incisors.
        self.teeth_weight = if self.shape.coronal { (smooth(0.6, 0.12, self.shape.min_area) * place * (1.0 - p[LATERAL])) as f64 } else { 0.0 };
        // A jet with no obstacle in front of it (dental /θ ð/) is a weak
        // source; the lips' own jet (/f v/) meets the lower lip and teeth.
        let dental = p[TIP_CLOSE] > 0.5 && p[TIP_PLACE] < 0.1 && !self.shape.coronal;
        let labial = self.shape.min_index >= N - 3;
        self.jet_weight = if dental { 0.22 } else if labial { 4.0 } else { 1.0 };
        let center = 7200.0 - 3900.0 * p[TIP_PLACE];
        // Obstacle source: a broad hump around the place's characteristic
        // frequency (higher for a short front cavity); the cavity in front
        // sets the actual peak.
        self.teeth_filter.bandpass(center, 0.9, self.int_rate);
        self.teeth_tilt.lowpass(center * 1.6, 0.7, self.int_rate);
        self.jet_filter.highpass(400.0, 0.5, self.int_rate);
        self.jet_tilt.lowpass(6000.0, 0.6, self.int_rate);
        self.asp_filter.bandpass(1500.0, 0.45, self.int_rate);
        self.tilt_coeff = 1.0 - (-2.0 * std::f64::consts::PI * 1500.0 / self.int_rate as f64).exp();

        // Pitch with vibrato and slow drift (cents).
        let h = p[HUMANIZE];
        self.vib_phase = (self.vib_phase + p[VIB_RATE] * (1.0 + 0.04 * h * self.drift) * dt).fract();
        let vib = p[VIB_DEPTH] * 85.0 * (2.0 * std::f32::consts::PI * self.vib_phase).sin();
        self.drift_velocity += (self.rng.gauss() * 0.9 - self.drift_velocity) * (dt * 4.0).min(1.0);
        self.drift += (self.drift_velocity - self.drift) * (dt * 1.8).min(1.0);
        let cents = vib + 14.0 * h * self.drift;
        self.f0 = p[PITCH] * 2f32.powf(cents / 1200.0);

        // Display telemetry.
        let mouth = self.airway.u[N] as f32;
        let nose = self.airway.un[crate::tract::NASAL_N] as f32;
        let km = 1.0 - (-dt / 0.03).exp();
        self.mouth_mean += (mouth - self.mouth_mean) * km;
        self.nose_mean += (nose - self.nose_mean) * km;
        let total = self.mouth_mean.max(0.0) + self.nose_mean.max(0.0);
        self.nasal_share = if total > 5.0 { self.nose_mean.max(0.0) / total } else { 0.0 };
        self.airflow = ((self.airway.u[0] as f32).max(0.0) / 900.0).min(1.5) * 0.3 + self.airflow * 0.7;
        let behind = self.shape.min_index.saturating_sub(1);
        let po = (self.airway.p[behind] as f32 / LUNG_FULL).max(0.0);
        self.oral_pressure += (po - self.oral_pressure) * km;
        self.closed = self.shape.path_area < 0.004;
        let k = 1.0 - (-dt / 0.015).exp();
        for i in 0..ENERGY_LEN {
            let pr = if i < N { self.airway.p[i] } else { self.airway.pn[i - N] } as f32;
            self.pressure_dc[i] += (pr - self.pressure_dc[i]) * 0.02;
            let e = (pr - self.pressure_dc[i]).abs() * 1e-3;
            self.energy[i] += (e - self.energy[i]) * k;
        }
    }

    /// The larynx above the folds. A twang narrows the epilarynx tube (about the
    /// first 1.6 cm) toward 0.3 cm², which brightens the voice with a ring near
    /// 3 kHz. A growl draws the ventricular folds (about 0.3–1 cm up) together,
    /// flapping at half the pitch; they never seal, so the flow keeps going.
    fn larynx(&mut self, p: &[f32; COUNT], dt: f32) {
        let dx = self.shape.length_cm / N as f32;
        let twang = p[TWANG];
        if twang > 0.0 {
            let n = ((TWANG_LENGTH / dx).round() as usize).clamp(2, 12);
            for a in self.areas[..n].iter_mut() {
                *a += (a.min(TWANG_AREA) - *a) * twang;
            }
        }
        // A trill: the narrowest constriction (tongue tip, lips or uvula) is held
        // loosely against its contact and the airflow pushes it open and lets it
        // spring shut about 27 times a second. Without a breath behind it, it
        // does not flap.
        let trill = p[TRILL];
        self.trill_phase = (self.trill_phase + TRILL_HZ * dt).fract();
        if trill > 0.0 {
            let drive = smooth(0.08, 0.3, p[LOUDNESS] * p[GATE]) * trill;
            let closed = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * self.trill_phase).cos());
            let k = self.shape.min_index.clamp(8, N - 1);
            for a in self.areas[k - 1..(k + 2).min(N)].iter_mut() {
                let flap = a.max(TRILL_OPEN) * (1.0 - closed);
                *a += (flap - *a) * drive;
            }
        }
        // Ejective: with the folds pressed shut, the larynx rises like a piston
        // and squeezes the pharynx; the air trapped behind an oral closure is
        // compressed (the airway turns the volume change into flow).
        let lx = p[LARYNX];
        if lx > 0.0 {
            for a in self.areas[..crate::tract::PORT].iter_mut() {
                *a *= 1.0 - LARYNX_SQUEEZE * lx;
            }
        }
        // Click: two seals in the mouth (back of the tongue and the tip or the
        // lips); the tongue body pulls down between them, and the air there
        // rarefies until the front seal lets go.
        let sc = p[SUCTION];
        if sc > 0.0 {
            let port = crate::tract::PORT;
            let first = (port + 1..N).find(|&i| self.areas[i] < CLICK_SEAL);
            let last = (port + 1..N).rev().find(|&i| self.areas[i] < CLICK_SEAL);
            if let (Some(a), Some(b)) = (first, last) {
                if b > a + 1 {
                    for area in self.areas[a + 1..b].iter_mut() {
                        if *area >= CLICK_SEAL {
                            *area *= 1.0 + SUCTION_EXPAND * sc;
                        }
                    }
                }
            }
        }
        let growl = p[GROWL];
        self.ventricular_phase = (self.ventricular_phase + 0.5 * self.f0 * dt).fract();
        if growl > 0.0 {
            let close = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * self.ventricular_phase).cos());
            let (a, b) = (((0.3 / dx) as usize).max(1), ((1.0 / dx).ceil() as usize).max(2));
            for area in self.areas[a..b.min(N)].iter_mut() {
                *area = (*area * (1.0 - 0.9 * growl * close)).max(0.06);
            }
        }
    }

    #[inline]
    fn tick(&mut self) -> f32 {
        if self.counter % CONTROL == 0 {
            self.control();
        }
        self.counter = self.counter.wrapping_add(1);
        let f0 = self.f0 * self.period_scale;
        self.phase += f0 / self.int_rate;
        if self.phase >= 1.0 {
            self.phase -= self.phase.floor();
            let h = self.p[HUMANIZE];
            self.period_scale = 1.0 + 0.0065 * h * self.rng.gauss();
            self.period_amp = 1.0 + 0.05 * h * self.rng.gauss();
            // Fry pairs the pulses (a short cycle with a weak pulse, then a long
            // one) with an irregular rhythm; the ventricular folds of a growl
            // load every other cycle, so the period doubles.
            self.odd_cycle = !self.odd_cycle;
            let (fry, growl) = (self.p[FRY], self.p[GROWL]);
            if self.odd_cycle {
                self.period_scale *= 1.0 - 0.35 * fry;
                self.period_amp *= (1.0 - 0.75 * fry - 0.3 * growl).max(0.05);
            } else {
                self.period_scale *= 1.0 + 0.35 * fry;
            }
            self.period_scale += 0.04 * fry * self.rng.gauss();
            self.period_scale = self.period_scale.max(0.3);
        }
        let open = glottal_pulse(self.phase, self.open_quotient, self.speed_quotient, self.sharpness);
        let ag = (self.abduction + self.swing * self.voicing_amp * self.period_amp * open) * (1.0 - self.p[GLOTTAL]);
        self.glottal_area = ag;
        self.lungs += self.d_lungs;

        // Turbulence, from the flow of the previous step: a dipole source
        // ∝ Re² − Re_c² (above the critical Reynolds number) downstream of
        // each jet, injected as a series pressure source.
        let w = &self.airway;
        let excess = |re: f64| ((re.min(RE_SATURATE)).powi(2) - RE_CRITICAL * RE_CRITICAL).max(0.0);
        let jet = excess(w.reynolds(self.jet_branch, 0.0));
        // The glottis is a slit (length ≫ width): hydraulic diameter 2A/ℓ, so Re = 2u/(ℓν).
        let glot = excess(2.0 * w.u[0].abs() / (crate::airway::GLOTTIS_LENGTH * crate::airway::NU));
        let downstream = w.u[self.jet_branch] >= 0.0;
        let n1 = self.rng.uniform();
        let n2 = self.rng.uniform();
        let n3 = self.rng.uniform();
        let raw = [
            self.jet_tilt.process(self.jet_filter.process(n1)) as f64,
            self.teeth_tilt.process(self.teeth_filter.process(n2)) as f64,
            self.asp_filter.process(n3) as f64,
        ];
        for k in 0..3 {
            self.tilt[k] += self.tilt_coeff * (raw[k] - self.tilt[k]);
        }
        // Pre-tilting cuts the level; restore it at the tilt corner.
        let (jet_noise, teeth_noise, asp_noise) = (self.tilt[0] * 4.0, self.tilt[1] * 6.0, self.tilt[2] * 2.5);
        let tw = self.teeth_weight;
        let sign = if downstream { 1.0 } else { -1.0 };
        self.airway.inject = [
            (if downstream { self.jet_at } else { self.jet_branch.saturating_sub(4) }, sign * GAIN_JET * self.jet_weight * (1.0 - 0.7 * tw.min(1.0)) * jet * jet_noise),
            (TEETH + 1, sign * GAIN_TEETH * tw * jet * teeth_noise),
            // A breathy voice's open posterior gap carries its own turbulent
            // jet, which the single-slit Reynolds number underrates. Only while
            // the folds vibrate: an /h/ is not louder in a breathy voice.
            (2, GAIN_GLOTTIS * (1.0 + 60.0 * (self.breathiness as f64).powi(3) * self.voicing_amp as f64) * glot * asp_noise),
        ];
        // Display: frication at a consonant constriction (the turbulence of
        // /h/ air through an open vowel tract is not a fricative's).
        self.frication = (jet / 6.4e7) as f32 * smooth(0.5, 0.2, self.shape.min_area);
        self.aspiration = (glot / 6.4e7) as f32;

        let (mouth, nose) = self.airway.step(ag as f64, self.lungs);
        let slot = ((self.phase * PULSE_POINTS as f32) as usize).min(PULSE_POINTS - 1);
        self.pulse[slot] = self.airway.u[0] as f32;
        // Radiated sound: the rate of change of the air leaving the body.
        let out = mouth + nose + WALL_RADIATION * self.airway.wall_flow;
        let radiated = (out - self.out_prev) / self.airway.dt * RADIATE;
        self.out_prev = out;
        radiated as f32
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
            // A runaway (far beyond any physical level) is reset, not passed on.
            let (l, r) = if l.is_finite() && r.is_finite() && l.abs() < 1e3 && r.abs() < 1e3 {
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
        self.airway.reset();
        self.resampler.reset();
        self.room.reset();
        self.dynamics.reset();
        self.dc.reset();
        for f in [&mut self.jet_filter, &mut self.jet_tilt, &mut self.teeth_filter, &mut self.teeth_tilt, &mut self.asp_filter] {
            f.reset();
        }
        self.out_prev = 0.0;
        self.lungs = 0.0;
        self.voicing_amp = 0.0;
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
        // Equivalent Rd of the current source settings, for display.
        s[STATE_RD] = (1.8 - 2.0 * self.p[TENSENESS] - 0.4 * (self.p[LOUDNESS] - 0.6)).clamp(0.3, 2.7);
        s[STATE_FLOW] = ((self.glottal_area - self.abduction) / self.swing.max(1e-3)).clamp(0.0, 1.0);
        s[STATE_PLAYING] = if self.playing { 1.0 } else { 0.0 };
        s[STATE_POSITION] = if self.playing { (self.frame - self.start_frame) as f32 / self.out_rate } else { 0.0 };
        s[STATE_RESETS] = self.resets as f32;
        s[STATE_ASPIRATION] = self.aspiration;
        s[STATE_BURST] = 0.0;
        s[STATE_SCORE_LENGTH] = self.end_frame as f32 / self.out_rate;
        s[STATE_NOISE_INDEX] = self.jet_at as f32;
        s[STATE_AIRFLOW] = self.airflow;
        s[STATE_NASAL_SHARE] = self.nasal_share;
        s[STATE_CLOSED] = if self.closed { 1.0 } else { 0.0 };
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

    /// The last cycle of glottal airflow, normalised to 0..1, at `out.len()`
    /// points (display).
    pub fn glottal_shape(&self, out: &mut [f32]) {
        let (lo, hi) = self.pulse.iter().fold((f32::MAX, f32::MIN), |(a, b), &v| (a.min(v), b.max(v)));
        let span = (hi - lo).max(1e-6);
        let n = out.len().max(1);
        for (i, v) in out.iter_mut().enumerate() {
            let k = (i * PULSE_POINTS / n).min(PULSE_POINTS - 1);
            *v = (self.pulse[k] - lo) / span;
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
