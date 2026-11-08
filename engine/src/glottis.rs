//! Glottal excitation based on the Liljencrants–Fant (LF) flow-derivative
//! model, shaped by the single Rd parameter using Fant's (1995) regressions.
//! Time is normalised to one fundamental period. Shape constants are solved
//! once per period with fixed iteration counts, so the cost is bounded.

use std::f64::consts::PI;

#[derive(Clone, Copy, Debug)]
pub struct LfShape {
    pub tp: f64,
    pub te: f64,
    pub ta: f64,
    pub alpha: f64,
    pub epsilon: f64,
    pub e0: f64,
    pub omega: f64,
    /// Peak of the integrated flow, used to normalise flow to 0..1.
    pub flow_peak: f64,
}

impl LfShape {
    pub fn from_rd(rd: f64) -> Self {
        let rd = rd.clamp(0.3, 2.7);
        let ra = (-1.0 + 4.8 * rd) / 100.0;
        let rk = (22.4 + 11.8 * rd) / 100.0;
        let denom = 4.0 * (0.11 * rd / (0.5 + 1.2 * rk) - ra);
        let rg = rk / denom.max(1e-3);
        let tp = (1.0 / (2.0 * rg)).clamp(0.12, 0.62);
        let te = (tp * (1.0 + rk)).clamp(tp + 0.02, 0.96);
        let ta = ra.clamp(0.002, (1.0 - te) * 0.9);
        let epsilon = solve_epsilon(ta, te);
        let omega = PI / tp;
        let alpha = solve_alpha(te, omega, epsilon, ta);
        let e0 = -1.0 / ((alpha * te).exp() * (omega * te).sin());
        let mut shape = LfShape { tp, te, ta, alpha, epsilon, e0, omega, flow_peak: 1.0 };
        // Peak flow occurs where the derivative crosses zero, at t = tp.
        shape.flow_peak = shape.open_flow(tp).abs().max(1e-6);
        shape
    }

    /// Flow derivative at normalised phase t (0..1), with Ee = 1.
    pub fn derivative(&self, t: f64) -> f64 {
        if t <= self.te {
            self.e0 * (self.alpha * t).exp() * (self.omega * t).sin()
        } else {
            let tail = (-self.epsilon * (1.0 - self.te)).exp();
            -((-self.epsilon * (t - self.te)).exp() - tail) / (self.epsilon * self.ta)
        }
    }

    /// Integrated flow during the open phase (closed form).
    fn open_flow(&self, t: f64) -> f64 {
        let a = self.alpha;
        let w = self.omega;
        let d = a * a + w * w;
        self.e0 * ((a * t).exp() * (a * (w * t).sin() - w * (w * t).cos()) + w) / d
    }

    /// Normalised glottal flow (≈0..1) at phase t.
    pub fn flow(&self, t: f64) -> f64 {
        let u = if t <= self.te {
            self.open_flow(t)
        } else {
            let ue = self.open_flow(self.te);
            let eps = self.epsilon;
            let tail = (-eps * (1.0 - self.te)).exp();
            let dt = t - self.te;
            ue - ((1.0 - (-eps * dt).exp()) / eps - dt * tail) / (eps * self.ta)
        };
        (u / self.flow_peak).clamp(-0.05, 1.2)
    }
}

/// Solve eps * ta = 1 - exp(-eps * (1 - te)) for eps.
fn solve_epsilon(ta: f64, te: f64) -> f64 {
    let tc = 1.0 - te;
    let mut eps = 1.0 / ta;
    for _ in 0..24 {
        let e = (-eps * tc).exp();
        let f = eps * ta - 1.0 + e;
        let df = ta - tc * e;
        if df.abs() < 1e-12 {
            break;
        }
        let next = eps - f / df;
        if !next.is_finite() || next <= 0.0 {
            break;
        }
        eps = next;
    }
    eps
}

/// Choose alpha so the flow returns to zero at the end of the period
/// (zero net excitation area).
fn solve_alpha(te: f64, omega: f64, eps: f64, ta: f64) -> f64 {
    let net = |alpha: f64| -> f64 {
        let e0 = -1.0 / ((alpha * te).exp() * (omega * te).sin());
        let d = alpha * alpha + omega * omega;
        let open = e0 * ((alpha * te).exp() * (alpha * (omega * te).sin() - omega * (omega * te).cos()) + omega) / d;
        let tc = 1.0 - te;
        let tail = (-eps * tc).exp();
        let ret = -((1.0 - tail) / eps - tc * tail) / (eps * ta);
        open + ret
    };
    let (mut lo, mut hi) = (-40.0_f64, 80.0_f64);
    let mut flo = net(lo);
    for _ in 0..60 {
        let mid = 0.5 * (lo + hi);
        let fm = net(mid);
        if !fm.is_finite() {
            hi = mid;
            continue;
        }
        if (fm > 0.0) == (flo > 0.0) {
            lo = mid;
            flo = fm;
        } else {
            hi = mid;
        }
    }
    0.5 * (lo + hi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flow_closes_and_peaks_near_one() {
        for rd in [0.3, 0.6, 1.0, 1.5, 2.0, 2.7] {
            let s = LfShape::from_rd(rd);
            let end = s.flow(1.0);
            assert!(end.abs() < 0.03, "rd {rd}: residual flow {end}");
            let peak = (0..200).map(|i| s.flow(i as f64 / 200.0)).fold(0.0, f64::max);
            assert!((peak - 1.0).abs() < 0.02, "rd {rd}: peak {peak}");
            assert!((s.derivative(s.te) + 1.0).abs() < 1e-6, "rd {rd}: Ee");
        }
    }

    #[test]
    fn higher_rd_is_smoother() {
        // Energy in the derivative's sharp closure falls as Rd rises.
        let tense = LfShape::from_rd(0.5);
        let lax = LfShape::from_rd(2.2);
        assert!(tense.ta < lax.ta);
    }
}
