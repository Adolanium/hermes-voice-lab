//! Hermes Voice Lab articulatory synthesis engine.
//!
//! One WebAssembly instance owns one voice. The same exports drive live
//! AudioWorklet playback, offline browser export and Node rendering.

pub mod airway;
pub mod analysis;
pub mod dsp;
pub mod glottis;
pub mod params;
pub mod tract;
pub mod voice;

use voice::Voice;

static mut VOICE: Option<Voice> = None;
static mut SCRATCH: [f32; 1024] = [0.0; 1024];

#[allow(static_mut_refs)]
fn voice() -> Option<&'static mut Voice> {
    // SAFETY: WebAssembly instances here are single-threaded; each instance
    // has its own linear memory and therefore its own VOICE.
    unsafe { VOICE.as_mut() }
}

#[allow(static_mut_refs)]
fn scratch() -> &'static mut [f32; 1024] {
    // SAFETY: as above; callers copy results out before the next call.
    unsafe { &mut SCRATCH }
}

#[no_mangle]
pub extern "C" fn engine_init(rate: f32, seed: u32) {
    // SAFETY: single-threaded instance.
    unsafe { VOICE = Some(Voice::new(rate, seed)) };
}

#[no_mangle]
pub extern "C" fn engine_param_count() -> u32 {
    params::COUNT as u32
}

/// [min, max, default, tau_ms] for parameter `id`, in scratch[0..4).
#[no_mangle]
pub extern "C" fn param_spec(id: u32) -> *const f32 {
    let s = scratch();
    if let Some(spec) = params::SPECS.get(id as usize) {
        s[..4].copy_from_slice(&[spec.min, spec.max, spec.default, spec.tau_ms]);
    }
    s.as_ptr()
}

#[no_mangle]
pub extern "C" fn engine_set(id: u32, value: f32, tau_ms: f32) {
    if let Some(v) = voice() {
        v.set(id as usize, value, tau_ms);
    }
}

#[no_mangle]
pub extern "C" fn engine_jump(id: u32, value: f32) {
    if let Some(v) = voice() {
        v.jump(id as usize, value);
    }
}

#[no_mangle]
pub extern "C" fn engine_render(frames: u32) -> u32 {
    voice().map(|v| v.render(frames as usize) as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn engine_out_left() -> *const f32 {
    voice().map(|v| v.out_l.as_ptr()).unwrap_or(std::ptr::null())
}

#[no_mangle]
pub extern "C" fn engine_out_right() -> *const f32 {
    voice().map(|v| v.out_r.as_ptr()).unwrap_or(std::ptr::null())
}

#[no_mangle]
pub extern "C" fn engine_params() -> *const f32 {
    voice().map(|v| v.p.as_ptr()).unwrap_or(std::ptr::null())
}

#[no_mangle]
pub extern "C" fn engine_areas() -> *const f32 {
    voice().map(|v| v.areas.as_ptr()).unwrap_or(std::ptr::null())
}

/// Smoothed sound-wave amplitude per section: N oral then nasal sections.
#[no_mangle]
pub extern "C" fn engine_energy() -> *const f32 {
    voice().map(|v| v.energy.as_ptr()).unwrap_or(std::ptr::null())
}

#[no_mangle]
pub extern "C" fn engine_state() -> *const f32 {
    voice().map(|v| v.state.as_ptr()).unwrap_or(std::ptr::null())
}

#[no_mangle]
pub extern "C" fn engine_glottal_shape(points: u32) -> *const f32 {
    let out = scratch();
    let n = (points as usize).clamp(1, out.len());
    if let Some(v) = voice() {
        v.glottal_shape(&mut out[..n]);
    }
    out.as_ptr()
}

#[no_mangle]
pub extern "C" fn score_staging() -> *mut f32 {
    voice().map(|v| v.staging.as_mut_ptr()).unwrap_or(std::ptr::null_mut())
}

#[no_mangle]
pub extern "C" fn score_capacity() -> u32 {
    voice::MAX_EVENTS as u32
}

#[no_mangle]
pub extern "C" fn score_load(count: u32, length_seconds: f32) -> u32 {
    voice().map(|v| v.load_score(count as usize, length_seconds) as u32).unwrap_or(0)
}

#[no_mangle]
pub extern "C" fn score_play(looping: u32) {
    if let Some(v) = voice() {
        v.play_score(looping != 0);
    }
}

#[no_mangle]
pub extern "C" fn score_stop() {
    if let Some(v) = voice() {
        v.stop_score();
    }
}

/// Area-function input buffer for `analyze` (N oral areas).
#[no_mangle]
pub extern "C" fn analysis_input() -> *mut f32 {
    scratch().as_mut_ptr()
}

/// Analyse the areas in `analysis_input()`. Results overwrite the scratch
/// buffer: [0..256) dB response, [256..266) formant (Hz, bandwidth) pairs.
#[no_mangle]
pub extern "C" fn analyze(nasal_area: f32, length_cm: f32) -> *const f32 {
    let s = scratch();
    let mut areas = [0.0f32; tract::N];
    for (i, a) in areas.iter_mut().enumerate() {
        let v = s[i];
        *a = if v.is_finite() { v.clamp(0.0, 12.0) } else { 1.0 };
    }
    let nasal = if nasal_area.is_finite() { nasal_area.clamp(0.0, 3.0) } else { 0.0 };
    let length = if length_cm.is_finite() { length_cm.clamp(9.0, 22.0) } else { 14.6 };
    let r = analysis::tract_response(&areas, nasal, length);
    s[..analysis::RESPONSE_BINS].copy_from_slice(&r.magnitude);
    for (k, (f, b)) in r.formants.iter().enumerate() {
        s[analysis::RESPONSE_BINS + 2 * k] = *f;
        s[analysis::RESPONSE_BINS + 2 * k + 1] = *b;
    }
    s.as_ptr()
}

/// Compute the area function for a parameter vector without rendering
/// (used by the UI for previews). Input: COUNT params in scratch[0..COUNT].
/// Output: scratch[0..N) areas, scratch[N] nasal area, scratch[N+1] length.
#[no_mangle]
pub extern "C" fn shape_from_params() -> *const f32 {
    let s = scratch();
    let mut p = [0.0f32; params::COUNT];
    for (i, v) in p.iter_mut().enumerate() {
        *v = params::clamp(i, s[i]);
    }
    let mut areas = [0.0f32; tract::N];
    let shape = tract::area_function(&p, &mut areas);
    s[..tract::N].copy_from_slice(&areas);
    s[tract::N] = shape.nasal_area;
    s[tract::N + 1] = shape.length_cm;
    s.as_ptr()
}

#[cfg(test)]
mod tests;
