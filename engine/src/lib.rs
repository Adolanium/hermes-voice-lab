//! Original pressure-wave tube synthesizer. No third-party DSP implementation.
use std::f64::consts::PI;
const N: usize = 44;
const RATE: f64 = 104_000.0;
const DEFAULT: [f64; 12] = [
    0.58, 0.42, 0.44, 0.64, 205.0, 0.16, 0.12, 0.65, 0.0, 1.0, 0.0, 0.0,
];

pub struct Engine {
    rate: f64,
    target: [f64; 12],
    p: [f64; 12],
    areas: [f32; N],
    reflection: [f64; N - 1],
    right: [f64; N],
    left: [f64; N],
    nose_right: [f64; 28],
    nose_left: [f64; 28],
    phase: f64,
    vibrato_phase: f64,
    seed: u32,
    counter: u32,
    envelope: f64,
    radiation_prev: f64,
    dc_prev: f64,
    dc_out: f64,
    lowpass: f64,
    position: f64,
    previous: f64,
    next: f64,
    output: [f32; 4096],
}
impl Engine {
    pub fn new(rate: f64, seed: u32) -> Self {
        let mut e = Self {
            rate: if rate.is_finite() {
                rate.clamp(8000.0, 192000.0)
            } else {
                48000.0
            },
            target: DEFAULT,
            p: DEFAULT,
            areas: [0.0; N],
            reflection: [0.0; N - 1],
            right: [0.0; N],
            left: [0.0; N],
            nose_right: [0.0; 28],
            nose_left: [0.0; 28],
            phase: 0.0,
            vibrato_phase: 0.0,
            seed: seed.max(1),
            counter: 0,
            envelope: 0.0,
            radiation_prev: 0.0,
            dc_prev: 0.0,
            dc_out: 0.0,
            lowpass: 0.0,
            position: 0.0,
            previous: 0.0,
            next: 0.0,
            output: [0.0; 4096],
        };
        e.geometry();
        e
    }
    pub fn set(&mut self, id: usize, value: f64) {
        if id >= 12 || !value.is_finite() {
            return;
        }
        self.target[id] = if id == 4 {
            value.clamp(80.0, 400.0)
        } else {
            value.clamp(0.0, 1.0)
        };
    }
    fn geometry(&mut self) {
        let center = 0.28 + 0.5 * self.p[0];
        for i in 0..N {
            let x = i as f64 / (N - 1) as f64;
            // Smooth, original anatomical proxy in cm²; no measured speaker or imported presets.
            let base = 1.05 + 1.9 * (PI * x).sin().powi(2) + 1.5 * self.p[2] * x;
            let width = 0.12 + 0.045 * (1.0 - self.p[0]);
            let tongue = (-0.5 * ((x - center) / width).powi(2)).exp();
            let mut area = base * (1.0 - (0.2 + 0.77 * self.p[1]) * tongue);
            let lip_blend = ((x - 0.84) / 0.16).clamp(0.0, 1.0);
            area = area * (1.0 - lip_blend)
                + (0.16 + 3.1 * self.p[3].powi(2) + 0.6 * self.p[2]) * lip_blend;
            self.areas[i] = area.clamp(0.08, 8.0) as f32;
        }
        for i in 0..N - 1 {
            let a = self.areas[i] as f64;
            let b = self.areas[i + 1] as f64;
            self.reflection[i] = (a - b) / (a + b);
        }
    }
    fn tick(&mut self) -> f64 {
        for i in 0..12 {
            self.p[i] += (self.target[i] - self.p[i]) * 0.00052;
        }
        if self.counter % 32 == 0 {
            self.geometry();
        }
        self.counter = self.counter.wrapping_add(1);
        self.vibrato_phase = (self.vibrato_phase + 5.2 / RATE).fract();
        let frequency = self.p[4]
            * 2.0_f64.powf(self.p[6] * 35.0 * (2.0 * PI * self.vibrato_phase).sin() / 1200.0);
        self.phase = (self.phase + frequency / RATE).fract();
        // Smooth asymmetric glottal flow, with a slower opening than closing phase.
        let open = 0.46;
        let close = 0.19 + 0.08 * self.p[5];
        let flow = if self.phase < open {
            0.5 - 0.5 * (PI * self.phase / open).cos()
        } else if self.phase < open + close {
            0.5 + 0.5 * (PI * (self.phase - open) / close).cos()
        } else {
            0.0
        };
        self.seed ^= self.seed << 13;
        self.seed ^= self.seed >> 17;
        self.seed ^= self.seed << 5;
        let noise = self.seed as f64 / u32::MAX as f64 * 2.0 - 1.0;
        let gate = self.p[8];
        self.envelope += (gate - self.envelope) * if gate > self.envelope { 0.001 } else { 0.0005 };
        let excitation =
            (flow * 0.22 * self.p[9] + noise * self.p[5] * 0.025 * (0.2 + flow)) * self.envelope;
        let mut right = [0.0; N];
        let mut left = [0.0; N];
        right[0] = excitation + 0.72 * self.left[0];
        left[N - 1] = -0.83 * self.right[N - 1];
        for i in 0..N - 1 {
            let w = self.reflection[i] * (self.right[i] + self.left[i + 1]);
            right[i + 1] = self.right[i] - w;
            left[i] = self.left[i + 1] + w;
        }
        // Variable-area side branch. Pressure continuity and volume-flow conservation
        // give P = 2 * sum(A_i * incoming_i) / sum(A_i).
        let branch = 18;
        let a = self.areas[branch] as f64;
        let b = self.areas[branch + 1] as f64;
        let c = 1.15 * self.p[11];
        let junction = 2.0
            * (a * self.right[branch] + b * self.left[branch + 1] + c * self.nose_left[0])
            / (a + b + c);
        left[branch] = junction - self.right[branch];
        right[branch + 1] = junction - self.left[branch + 1];
        let mut nr = [0.0; 28];
        let mut nl = [0.0; 28];
        // The coupling transmission vanishes with velum area; matched closed branch otherwise.
        nr[0] = if c > 0.0001 {
            junction - self.nose_left[0]
        } else {
            0.0
        };
        nl[27] = -0.78 * self.nose_right[27];
        for i in 0..27 {
            nr[i + 1] = self.nose_right[i];
            nl[i] = self.nose_left[i + 1];
        }
        let nasal_output = self.nose_right[27] * 0.22 * self.p[11];
        for i in 0..28 {
            self.nose_right[i] = (nr[i] * 0.991).clamp(-8.0, 8.0);
            self.nose_left[i] = (nl[i] * 0.991).clamp(-8.0, 8.0);
        }
        let at = ((0.28 + 0.5 * self.p[0]) * (N - 1) as f64) as usize;
        right[at] += (noise * self.p[10] * 0.035) * self.envelope;
        let mouth = self.right[N - 1] * 0.17 + nasal_output;
        for i in 0..N {
            self.right[i] = (right[i] * 0.9985).clamp(-8.0, 8.0);
            self.left[i] = (left[i] * 0.9985).clamp(-8.0, 8.0);
        }
        let radiated = (mouth - self.radiation_prev) * 85.0;
        self.radiation_prev = mouth;
        let dc = radiated - self.dc_prev + 0.995 * self.dc_out;
        self.dc_prev = radiated;
        self.dc_out = dc;
        // Output anti-alias rolloff at lower host rates, plus soft peak bounding.
        let cutoff = (self.rate * 0.38).min(12000.0);
        let alpha = 1.0 - (-2.0 * PI * cutoff / RATE).exp();
        self.lowpass += alpha * (dc - self.lowpass);
        let y = self.lowpass * self.p[7] * 2.2;
        if y.is_finite() {
            y / (1.0 + y.abs())
        } else {
            0.0
        }
    }
    pub fn render(&mut self, count: usize) -> &[f32] {
        let count = count.min(4096);
        for i in 0..count {
            while self.position >= 1.0 {
                self.previous = self.next;
                self.next = self.tick();
                self.position -= 1.0;
            }
            self.output[i] = (self.previous + (self.next - self.previous) * self.position) as f32;
            self.position += RATE / self.rate;
        }
        &self.output[..count]
    }
}
// Each WASM instance owns one independent engine; no globals cross instances.
thread_local! { static ENGINE: std::cell::RefCell<Option<Engine>> = const { std::cell::RefCell::new(None) }; }
#[no_mangle]
pub extern "C" fn init(rate: f64, seed: u32) {
    ENGINE.with(|e| *e.borrow_mut() = Some(Engine::new(rate, seed)));
}
#[no_mangle]
pub extern "C" fn set_param(id: u32, value: f64) {
    ENGINE.with(|e| {
        if let Some(e) = e.borrow_mut().as_mut() {
            e.set(id as usize, value)
        }
    });
}
#[no_mangle]
pub extern "C" fn render(count: u32) -> *const f32 {
    ENGINE.with(|e| {
        e.borrow_mut()
            .as_mut()
            .map(|e| e.render(count as usize).as_ptr())
            .unwrap_or(std::ptr::null())
    })
}
#[no_mangle]
pub extern "C" fn geometry() -> *const f32 {
    ENGINE.with(|e| {
        e.borrow()
            .as_ref()
            .map(|e| e.areas.as_ptr())
            .unwrap_or(std::ptr::null())
    })
}
#[no_mangle]
pub extern "C" fn current_param(id: u32) -> f64 {
    ENGINE.with(|e| {
        e.borrow()
            .as_ref()
            .and_then(|e| e.p.get(id as usize).copied())
            .unwrap_or(0.0)
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finite_under_sweeps() {
        for rate in [8000., 44100., 48000., 96000., 192000.] {
            let mut e = Engine::new(rate, 42);
            e.set(8, 1.);
            for step in 0..150 {
                for id in 0..12 {
                    e.set(
                        id,
                        if id == 4 {
                            80. + (step % 80) as f64 * 4.
                        } else {
                            ((step * 17 + id * 11) % 100) as f64 / 99.
                        },
                    );
                }
                assert!(e
                    .render(1024)
                    .iter()
                    .all(|s| s.is_finite() && s.abs() <= 1.));
            }
        }
    }
    #[test]
    fn invalid_params_ignored() {
        let mut e = Engine::new(f64::NAN, 1);
        e.set(4, f64::NAN);
        e.set(20, 10.);
        assert_eq!(e.target, DEFAULT);
    }
    #[test]
    fn deterministic_and_audible() {
        let mut a = Engine::new(48000., 7);
        let mut b = Engine::new(48000., 7);
        a.set(8, 1.);
        b.set(8, 1.);
        for _ in 0..24 {
            assert_eq!(a.render(2048), b.render(2048));
        }
        let rms = (a
            .render(4096)
            .iter()
            .map(|x| (*x as f64).powi(2))
            .sum::<f64>()
            / 4096.)
            .sqrt();
        assert!(rms > 0.005, "RMS {rms}");
    }
    #[test]
    fn release_decays() {
        let mut e = Engine::new(48000., 7);
        e.set(8, 1.);
        for _ in 0..20 {
            e.render(4096);
        }
        e.set(8, 0.);
        for _ in 0..20 {
            e.render(4096);
        }
        assert!(e.render(4096).iter().all(|x| x.abs() < 0.00001));
    }
}
