use voice_lab_engine::analysis::tract_response;
use voice_lab_engine::params::*;
use voice_lab_engine::tract::{area_function, N};
fn f(p: &[f32; COUNT]) -> String {
    let mut a = [0.0; N];
    let s = area_function(p, &mut a);
    let r = tract_response(&a, s.nasal_area, s.length_cm);
    format!("F {:?} areas {:?}", r.formants.iter().take(3).map(|x| x.0 as i32).collect::<Vec<_>>(), a.iter().step_by(4).map(|v| (v*10.0).round()/10.0).collect::<Vec<_>>())
}
fn main() {
    let mut p = [0.0f32; COUNT];
    for (i, s) in SPECS.iter().enumerate() { p[i] = s.default; }
    let args: Vec<f32> = std::env::args().skip(1).map(|a| a.parse().unwrap()).collect();
    for chunk in args.chunks(6) {
        p[TONGUE_X]=chunk[0]; p[TONGUE_Y]=chunk[1]; p[JAW]=chunk[2]; p[LIP_OPEN]=chunk[3]; p[LIP_ROUND]=chunk[4]; p[RHOTIC]=chunk[5];
        println!("{:?} -> {}", chunk, f(&p));
    }
}
