//! Articulatory area function: the cross-section of the oral tract, from
//! glottis (section 0) to lips (N−1), computed from the articulator
//! parameters, plus the fixed nasal passage. The acoustics live in `airway`.

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
    // Constriction centres are continuous: a seal that hopped from one
    // section to the next would release the air trapped between them at once.
    let tip_center = lerp(TEETH as f32 - 0.3, TEETH as f32 - 6.0, p[TIP_PLACE]);
    let dorsum_center = lerp(0.62, 0.74, tx) * N as f32;
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
        // Flat-topped profiles (the tongue presses along a stretch of the
        // roof), so a complete closure seals whole sections wherever its
        // centre lies, and moves continuously.
        let dd = i as f32 - dorsum_center;
        a *= 1.0 - dorsum_close * (1.3 * (-(dd / 1.6).powi(2)).exp()).min(1.0);
        let td = i as f32 - tip_center;
        // A tip constriction spans about three sections (1 cm).
        let tg = (1.25 * (-(td / 1.6).powi(4)).exp()).min(1.0);
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
    shape.nasal_area = 0.5 * p[VELUM];
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
