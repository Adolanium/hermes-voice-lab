//! Articulatory area function and the Kelly–Lochbaum waveguide.
//!
//! The oral tract is a chain of `N` cylindrical sections from glottis (0) to
//! lips (N-1). A wave moves one section per tick, so section length is
//! `c / fs_internal` and tract length is set by the internal clock. A nasal
//! tube joins the oral tract through a velum-controlled three-port junction.

use crate::params::*;

pub const N: usize = 44;
pub const NASAL_N: usize = 30;
/// Speed of sound in warm, humid air (cm/s).
pub const SOUND_SPEED: f32 = 35_000.0;
/// Relative position of the velopharyngeal port along the oral tract.
pub const PORT: usize = 24;
/// Index of the section behind the upper incisors.
pub const TEETH: usize = N - 4;
/// Combined nostril opening (cm²).
pub const NOSTRIL_AREA: f32 = 1.0;

/// Derived information about the current shape, used by aerodynamics,
/// noise placement and the UI.
#[derive(Clone, Copy, Default, Debug)]
pub struct Shape {
    pub length_cm: f32,
    pub nasal_area: f32,
    pub min_area: f32,
    pub min_index: usize,
    /// Smallest area of the airflow path out of the body (oral or nasal).
    pub path_area: f32,
    /// The minimum is produced by the tongue tip (sibilant source at teeth).
    pub coronal: bool,
}

fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

/// Neutral cross-sectional area (cm²) at relative position u, before the
/// tongue is placed. Original piecewise-smooth proxy: narrow epilaryngeal
/// tube, wide pharynx, oral cavity scaled by the jaw.
fn neutral(u: f32, throat: f32, jaw: f32) -> f32 {
    let larynx = lerp(0.55, 2.1, smoothstep(0.0, 0.1, u));
    let pharynx = 2.7 * (0.62 + 0.85 * throat);
    let oral = 3.3 * (0.75 + 0.5 * jaw);
    let a = lerp(larynx, pharynx, smoothstep(0.06, 0.16, u));
    let a = lerp(a, 2.5, smoothstep(0.44, 0.54, u) * (1.0 - smoothstep(0.56, 0.66, u)));
    lerp(a, oral, smoothstep(0.56, 0.68, u))
}

/// Tongue-body constriction location (fraction of tract from glottis) and
/// area (cm²) at the corners: back-low, front-low, back-high, front-high.
const TONGUE: [f32; 8] = [0.27, 0.55, 0.63, 0.745, 0.26, 1.25, 0.5, 0.42];

/// Tongue-body profile: posterior/anterior flank widths (base, front-high
/// increment), pharynx widening for front-high and oral widening for back-low.
const TONGUE_SHAPE: [f32; 6] = [0.1, 0.13, 0.085, 0.02, 1.1, 1.5];

/// Rhotic constriction depths, widths and positions (pharyngeal, palatal).
const RHO: [f32; 6] = [0.75, 0.92, 0.08, 0.07, 0.22, 0.63];

/// Area (cm²) left by the tongue tip at rest; a closing tip gesture
/// shrinks it quadratically to zero at contact.
const TIP_SPAN: f32 = 8.0;

/// Closure parameters aim past the point of contact, as real articulators
/// do: tissue meets the opposing surface at 92% of the gesture, so a closing
/// movement reaches zero area at a definite moment rather than only
/// approaching it asymptotically.
pub const CONTACT: f32 = 0.92;
/// Lip opening at or below which the lips are sealed.
pub const LIP_CONTACT: f32 = 0.04;

/// Fraction of the local area removed by a closing gesture. The aperture
/// (and the grooved blade's width) both shrink as the articulator rises, so
/// the remaining area falls quadratically: narrow fricative channels are
/// reached early in the movement instead of only in its last percent.
#[inline]
fn closure(c: f32) -> f32 {
    let open = 1.0 - (c / CONTACT).clamp(0.0, 1.0);
    1.0 - open * open
}

#[inline]
fn lip_aperture(open: f32) -> f32 {
    ((open - LIP_CONTACT) / (1.0 - LIP_CONTACT)).clamp(0.0, 1.0)
}

/// Compute the oral area function (cm²) from smoothed parameters.
pub fn area_function(p: &[f32; COUNT], areas: &mut [f32; N]) -> Shape {
    let tx = p[TONGUE_X];
    let ty = p[TONGUE_Y];
    let jaw = p[JAW];
    // Tongue-body constriction location and area at the vowel-space corners:
    // front-high (palatal), back-high (velar), back-low (pharyngeal),
    // front-low (weak, mid-tract).
    let [l_bl, l_fl, l_bh, l_fh, a_bl, a_fl, a_bh, a_fh] = TONGUE;
    let loc = lerp(lerp(l_bl, l_fl, tx), lerp(l_bh, l_fh, tx), ty);
    let ln_area = lerp(lerp(a_bl.ln(), a_fl.ln(), tx), lerp(a_bh.ln(), a_fh.ln(), tx), ty);
    let constriction = ln_area.exp() * (0.85 + 0.3 * jaw);
    // The tongue dorsum rises steeply from the pharynx and runs along the
    // palate for front vowels, so the posterior flank is longer.
    let [wb0, wb1, wf0, wf1, ph_k, or_k] = TONGUE_SHAPE;
    let width_back = wb0 + wb1 * tx * ty;
    let width_front = wf0 + wf1 * tx * ty;
    let pharynx_gain = 1.0 + ph_k * tx * ty.powf(0.7);
    let oral_gain = 1.0 + or_k * (1.0 - tx) * (1.0 - ty);
    let rhotic = p[RHOTIC];

    // Tip place: 0 at the upper incisors, ~0.4 alveolar ridge (1 cm behind),
    // ~0.85 postalveolar (1.8 cm), so sibilant front cavities differ.
    let tip_center = lerp(TEETH as f32 - 0.3, TEETH as f32 - 6.0, p[TIP_PLACE]).round() as i32;
    let dorsum_center = (lerp(0.62, 0.74, tx) * N as f32).round() as i32;
    let tip_close = closure(p[TIP_CLOSE]);
    let dorsum_close = closure(p[DORSUM_CLOSE]);
    let lip_area = lip_aperture(p[LIP_OPEN]).powf(1.35) * (5.2 - 3.7 * p[LIP_ROUND]) * (0.8 + 0.3 * jaw);
    let mut shape = Shape::default();
    shape.min_area = f32::MAX;
    let mut tip_min = f32::MAX;

    for i in 0..N {
        let u = (i as f32 + 0.5) / N as f32;
        let mut a = neutral(u, p[THROAT], jaw);
        a *= lerp(1.0, pharynx_gain, smoothstep(0.1, 0.2, u) * (1.0 - smoothstep(0.48, 0.6, u)));
        a *= lerp(1.0, oral_gain, smoothstep(0.62, 0.74, u));
        let width = if u < loc { width_back } else { width_front };
        let g = (-((u - loc) / width).powi(2)).exp();
        if a > constriction {
            a = constriction + (a - constriction) * (1.0 - g);
        }
        // Rhotic bunching narrows the tract near the third resonance's
        // velocity maxima in the pharynx and under the velum.
        if rhotic > 0.0 {
            let ph = (-((u - RHO[4]) / RHO[2]).powi(2)).exp();
            let pal = (-((u - RHO[5]) / RHO[3]).powi(2)).exp();
            a *= 1.0 - rhotic * (RHO[0] * ph + RHO[1] * pal);
        }
        if i >= TEETH - 1 && i < N - 2 {
            a *= 0.7 + 0.35 * jaw;
        }
        if i == PORT {
            a *= 1.0 - 0.22 * p[VELUM];
        }
        // Dorsum closure (velar stops and nasal) and tip closure (coronals).
        let dd = (i as i32 - dorsum_center) as f32;
        a *= 1.0 - dorsum_close * (-(dd / 1.6).powi(2)).exp();
        let td = (i as i32 - tip_center) as f32;
        // Flat-topped profile: a tip constriction spans about three sections (1 cm).
        let tg = (-(td / 1.6).powi(4)).exp();
        let lateral = p[LATERAL] * 0.25 * tg;
        // The tip/blade forms its channel against the palate whatever the
        // tongue body is doing, so its area is absolute, not a fraction of
        // the local (vowel-dependent) area: /s/ is equally narrow next to /i/ and /a/.
        let tip_area = TIP_SPAN * (1.0 - tip_close);
        a = lerp(a, a.min(tip_area), tg).max(lateral.min(a));
        if tg > 0.5 {
            tip_min = tip_min.min(a);
        }
        if i >= N - 2 {
            a = lip_area;
        } else if i == N - 3 {
            a = 0.5 * (a + lip_area);
        }
        let a = if a.is_finite() { a.clamp(0.0, 12.0) } else { 1.0 };
        areas[i] = a;
        if i > 6 && a < shape.min_area {
            shape.min_area = a;
            shape.min_index = i;
        }
    }
    shape.length_cm = p[TRACT_LEN] + 1.1 * p[LIP_ROUND];
    shape.nasal_area = 1.5 * p[VELUM];
    shape.coronal = (tip_min - shape.min_area).abs() < 1e-4 && p[TIP_CLOSE] > 0.5 && p[TIP_PLACE] > 0.1;
    // Air escapes through the nose when the oral closure lies in front of the port.
    let upstream = areas[7..=PORT].iter().copied().fold(f32::MAX, f32::min);
    shape.path_area = if shape.min_index > PORT && shape.nasal_area > 0.0 {
        shape.min_area.max(shape.nasal_area.min(upstream))
    } else {
        shape.min_area
    };
    shape
}

/// Fixed nasal cavity area function (cm²), port to nostrils. Original proxy.
pub fn nasal_areas() -> [f32; NASAL_N] {
    let mut a = [0.0; NASAL_N];
    for (i, v) in a.iter_mut().enumerate() {
        let u = (i as f32 + 0.5) / NASAL_N as f32;
        *v = lerp(1.1, 2.6, smoothstep(0.0, 0.25, u)) * (1.0 - 0.6 * smoothstep(0.7, 1.0, u));
    }
    a
}

/// Kelly–Lochbaum waveguide with nasal side branch, using power-normalised
/// travelling waves (w = p·√A). Each junction is then a rotation, which
/// conserves energy even while areas change, so closing and reopening a
/// section cannot pump up hidden pressure and release it as a click.
pub struct Waveguide {
    pub right: [f32; N],
    pub left: [f32; N],
    reflection: [f32; N],
    transmission: [f32; N],
    damping: [f32; N],
    root_area: [f32; N],
    /// Per-tick increments that glide the coefficients to the latest area
    /// function over one control period (see `set_areas_ramped`).
    d_reflection: [f32; N],
    d_transmission: [f32; N],
    d_damping: [f32; N],
    d_root_area: [f32; N],
    d_coupling: f32,
    ramp_left: u32,
    /// Section of a turbulent jet's exit and the extra per-tick loss it
    /// adds just downstream (set before `set_areas_ramped`).
    pub jet_at: usize,
    pub jet_loss: f32,
    pub areas: [f32; N],
    pub nasal_right: [f32; NASAL_N],
    nasal_left: [f32; NASAL_N],
    nasal_reflection: [f32; NASAL_N],
    nasal_transmission: [f32; NASAL_N],
    nasal_areas: [f32; NASAL_N],
    pub nasal_coupling: f32,
    pub glottal_reflection: f32,
    lip_lp: f32,
    nose_lp: f32,
    lip_coeff: f32,
    nose_coeff: f32,
}

impl Waveguide {
    pub fn new() -> Self {
        let nasal_areas = nasal_areas();
        let mut nasal_reflection = [0.0; NASAL_N];
        let mut nasal_transmission = [1.0; NASAL_N];
        for i in 0..NASAL_N - 1 {
            nasal_reflection[i] = scatter(nasal_areas[i], nasal_areas[i + 1]);
            nasal_transmission[i] = (1.0 - nasal_reflection[i] * nasal_reflection[i]).max(0.0).sqrt();
        }
        Self {
            right: [0.0; N],
            left: [0.0; N],
            reflection: [0.0; N],
            transmission: [1.0; N],
            damping: [0.999; N],
            root_area: [1.7; N],
            d_reflection: [0.0; N],
            d_transmission: [0.0; N],
            d_damping: [0.0; N],
            d_root_area: [0.0; N],
            d_coupling: 0.0,
            ramp_left: 0,
            jet_at: N,
            jet_loss: 0.0,
            areas: [3.0; N],
            nasal_right: [0.0; NASAL_N],
            nasal_left: [0.0; NASAL_N],
            nasal_reflection,
            nasal_transmission,
            nasal_areas,
            nasal_coupling: 0.0,
            glottal_reflection: 0.9,
            lip_lp: 0.0,
            nose_lp: 0.0,
            lip_coeff: 0.3,
            nose_coeff: 0.3,
        }
    }

    pub fn reset(&mut self) {
        self.right = [0.0; N];
        self.left = [0.0; N];
        self.nasal_right = [0.0; NASAL_N];
        self.nasal_left = [0.0; NASAL_N];
        self.lip_lp = 0.0;
        self.nose_lp = 0.0;
    }

    /// Install a new area function immediately. `rate` is the internal tick rate.
    pub fn set_areas(&mut self, areas: &[f32; N], nasal_area: f32, rate: f32) {
        self.set_areas_ramped(areas, nasal_area, rate, 0);
    }

    /// Install a new area function, gliding the junction coefficients to it
    /// linearly over `ticks` ticks. Stepping the coefficients at control rate
    /// makes every step of a closing constriction scatter the energy trapped
    /// behind it as a small impulse; near closure these merge into a click.
    /// Interpolating (k, t) pairs along a chord keeps k² + t² ≤ 1 (passive).
    pub fn set_areas_ramped(&mut self, areas: &[f32; N], nasal_area: f32, rate: f32, ticks: u32) {
        // Finish any glide in progress so the new one starts from its end.
        if self.ramp_left > 0 {
            let n = self.ramp_left as f32;
            for i in 0..N {
                self.reflection[i] += n * self.d_reflection[i];
                self.transmission[i] += n * self.d_transmission[i];
                self.damping[i] += n * self.d_damping[i];
                self.root_area[i] += n * self.d_root_area[i];
            }
            self.nasal_coupling += n * self.d_coupling;
        }
        self.areas = *areas;
        let inv = if ticks > 0 { 1.0 / ticks as f32 } else { 0.0 };
        let glide = |cur: &mut f32, d: &mut f32, target: f32| {
            if ticks > 0 {
                *d = (target - *cur) * inv;
            } else {
                *cur = target;
                *d = 0.0;
            }
        };
        glide(&mut self.nasal_coupling, &mut self.d_coupling, nasal_area);
        for i in 0..N {
            let (k, t) = if i < N - 1 {
                let k = scatter(areas[i], areas[i + 1]);
                (k, (1.0 - k * k).max(0.0).sqrt())
            } else {
                (0.0, 1.0)
            };
            glide(&mut self.reflection[i], &mut self.d_reflection[i], k);
            glide(&mut self.transmission[i], &mut self.d_transmission[i], t);
            glide(&mut self.root_area[i], &mut self.d_root_area[i], areas[i].max(0.0).sqrt());
            // Wall and viscous losses grow as the section narrows.
            let loss = 0.00022 + 0.00034 / areas[i].max(0.05).sqrt();
            let mut damp = (1.0 - loss * 106_000.0 / rate).clamp(0.9, 0.99995);
            // A jet leaving a constriction dissipates sound in front of it,
            // which keeps the small front cavity of a fricative from ringing.
            if i > self.jet_at && i <= self.jet_at + 2 {
                damp *= 1.0 - self.jet_loss.clamp(0.0, 0.5) * 106_000.0 / rate;
            }
            glide(&mut self.damping[i], &mut self.d_damping[i], damp);
        }
        self.ramp_left = ticks;
        // A piston of radius a radiates efficiently above roughly c/(2πa);
        // below that most of the wave reflects (inverted) back into the tube.
        let cutoff = |area: f32| {
            let radius = (area.max(0.01) / std::f32::consts::PI).sqrt();
            (0.9 * SOUND_SPEED / (2.0 * std::f32::consts::PI * radius)).clamp(1500.0, 0.45 * rate)
        };
        let coeff = |hz: f32| 1.0 - (-2.0 * std::f32::consts::PI * hz / rate).exp();
        self.lip_coeff = coeff(cutoff(areas[N - 1]));
        self.nose_coeff = coeff(cutoff(NOSTRIL_AREA));
    }

    /// One tick. `source` is the glottal volume-flow input; `noise` and
    /// `noise2` are pressure sources (index, value) injected as series dipoles.
    /// Returns (lip volume velocity, nostril volume velocity); radiated
    /// pressure is their time derivative.
    #[inline]
    pub fn tick(&mut self, source: f32, noise_at: usize, noise: f32, noise2_at: usize, noise2: f32) -> (f32, f32) {
        if self.ramp_left > 0 {
            self.ramp_left -= 1;
            for i in 0..N {
                self.reflection[i] += self.d_reflection[i];
                self.transmission[i] += self.d_transmission[i];
                self.damping[i] += self.d_damping[i];
                self.root_area[i] += self.d_root_area[i];
            }
            self.nasal_coupling += self.d_coupling;
        }
        let mut nr = [0.0f32; N];
        let mut nl = [0.0f32; N];
        // A volume-velocity source u enters as a pressure wave ρc·u/A, i.e. a
        // normalised wave u/√A (constants folded into gains).
        nr[0] = self.left[0] * self.glottal_reflection + source / self.root_area[0].max(0.3);
        for i in 0..N - 1 {
            let k = self.reflection[i];
            let t = self.transmission[i];
            let a = self.right[i];
            let b = self.left[i + 1];
            nr[i + 1] = t * a - k * b;
            nl[i] = k * a + t * b;
        }
        // Three-port junction between sections PORT and PORT+1, evaluated in
        // pressure waves and converted back.
        let an = self.nasal_coupling;
        let entering = if an > 1e-4 {
            let (s1, s2, sn) = (self.root_area[PORT].max(0.032), self.root_area[PORT + 1].max(0.032), an.sqrt());
            let (a1, a2) = (s1 * s1, s2 * s2);
            let p1 = self.right[PORT] / s1;
            let p2 = self.left[PORT + 1] / s2;
            let pn = self.nasal_left[0] / sn;
            let p = 2.0 * (a1 * p1 + a2 * p2 + an * pn) / (a1 + a2 + an);
            nl[PORT] = (p - p1) * s1;
            nr[PORT + 1] = (p - p2) * s2;
            (p - pn) * sn
        } else {
            0.0
        };
        let nose = self.nasal_step(entering);
        // Lip radiation: low frequencies reflect (inverted), highs escape.
        let incident = self.right[N - 1];
        self.lip_lp += self.lip_coeff * (incident - self.lip_lp);
        let reflected = -0.96 * self.lip_lp;
        nl[N - 1] = reflected;
        // Volume velocity leaving the lips: √A·(w⁺ − w⁻).
        let mouth = self.root_area[N - 1] * (incident - reflected);

        for (at, value) in [(noise_at, noise), (noise2_at, noise2)] {
            if value != 0.0 && at < N {
                // Jet turbulence radiates mostly downstream of the constriction.
                // A pressure source p enters as p·√A; capping A keeps the
                // level from depending on how wide the cavity at the obstacle is.
                let s = self.root_area[at].min(1.0);
                nr[at] += 0.8 * value * s;
                nl[at] -= 0.2 * value * s;
            }
        }
        for i in 0..N {
            self.right[i] = (nr[i] * self.damping[i]).clamp(-60.0, 60.0);
            self.left[i] = (nl[i] * self.damping[i]).clamp(-60.0, 60.0);
        }
        (mouth, nose)
    }

    /// Advance the nasal tube; returns nostril volume velocity.
    fn nasal_step(&mut self, entering: f32) -> f32 {
        let mut nr = [0.0f32; NASAL_N];
        let mut nl = [0.0f32; NASAL_N];
        nr[0] = entering;
        for i in 0..NASAL_N - 1 {
            let k = self.nasal_reflection[i];
            let t = self.nasal_transmission[i];
            let a = self.nasal_right[i];
            let b = self.nasal_left[i + 1];
            nr[i + 1] = t * a - k * b;
            nl[i] = k * a + t * b;
        }
        let incident = self.nasal_right[NASAL_N - 1];
        self.nose_lp += self.nose_coeff * (incident - self.nose_lp);
        let reflected = -0.94 * self.nose_lp;
        nl[NASAL_N - 1] = reflected;
        for i in 0..NASAL_N {
            self.nasal_right[i] = (nr[i] * 0.9935).clamp(-60.0, 60.0);
            self.nasal_left[i] = (nl[i] * 0.9935).clamp(-60.0, 60.0);
        }
        self.nasal_areas[NASAL_N - 1].sqrt() * (incident - reflected)
    }

    /// Scale applied to a pressure source injected in section `i`.
    #[inline]
    pub fn injection_scale(&self, i: usize) -> f32 {
        self.root_area[i.min(N - 1)].min(1.0)
    }

    /// Acoustic pressure (normalised units) in section `i`.
    #[inline]
    pub fn pressure_at(&self, i: usize) -> f32 {
        (self.right[i] + self.left[i]) / self.root_area[i].max(0.1)
    }

    pub fn nasal_area_profile(&self) -> &[f32; NASAL_N] {
        &self.nasal_areas
    }

    /// Volume velocity currently leaving lips and nostrils (for analysis).
    pub fn outflow(&self) -> f32 {
        self.root_area[N - 1] * self.right[N - 1] + self.nasal_areas[NASAL_N - 1].sqrt() * self.nasal_right[NASAL_N - 1]
    }
}

/// Pressure-wave reflection coefficient at a junction from area a to area b.
#[inline]
pub fn scatter(a: f32, b: f32) -> f32 {
    let sum = a + b;
    if sum < 1e-6 {
        0.0
    } else {
        ((a - b) / sum).clamp(-1.0, 1.0)
    }
}

pub fn internal_rate(length_cm: f32) -> f32 {
    N as f32 * SOUND_SPEED / length_cm.clamp(9.0, 22.0)
}
