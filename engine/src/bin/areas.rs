//! Print the area function for a parameter set: cargo run --bin areas -- "tip=0.4,tipc=0.9"
use voice_lab_engine::analysis::tract_response;
use voice_lab_engine::params::*;
use voice_lab_engine::tract::{area_function, N};

fn id(name: &str) -> usize {
    match name {
        "voicing" => VOICING, "tx" => TONGUE_X, "ty" => TONGUE_Y, "tip" => TIP_PLACE, "tipc" => TIP_CLOSE,
        "dor" => DORSUM_CLOSE, "jaw" => JAW, "lip" => LIP_OPEN, "round" => LIP_ROUND, "velum" => VELUM,
        "len" => TRACT_LEN, "throat" => THROAT, "lat" => LATERAL, "rho" => RHOTIC, _ => panic!("unknown {name}"),
    }
}

fn main() {
    for arg in std::env::args().skip(1) {
        let mut p = [0.0f32; COUNT];
        for (i, s) in SPECS.iter().enumerate() {
            p[i] = s.default;
        }
        for kv in arg.split(',').filter(|s| !s.is_empty()) {
            let (k, v) = kv.split_once('=').unwrap();
            p[id(k)] = v.parse().unwrap();
        }
        let mut a = [0.0f32; N];
        let s = area_function(&p, &mut a);
        println!("{arg}: min {:.3} @{} coronal {} | {}", s.min_area, s.min_index, s.coronal,
            a[28..].iter().map(|v| format!("{v:.2}")).collect::<Vec<_>>().join(" "));
        let r = tract_response(&a, s.nasal_area, s.length_cm);
        println!("   formants {}", r.formants.iter().map(|(f, b)| format!("{f:.0}/{b:.0}")).collect::<Vec<_>>().join("  "));
    }
}
