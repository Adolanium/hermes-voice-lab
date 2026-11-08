//! Print per-millisecond engine telemetry for a probe script:
//! cargo run --release --bin trace -- <script> [from_s] [to_s]
use voice_lab_engine::params::*;
use voice_lab_engine::voice::Voice;

fn id(name: &str) -> usize {
    match name {
        "pitch" => PITCH, "loud" => LOUDNESS, "gate" => GATE, "tense" => TENSENESS, "breath" => BREATH,
        "voicing" => VOICING, "vib" => VIB_DEPTH, "tx" => TONGUE_X, "ty" => TONGUE_Y, "tip" => TIP_PLACE,
        "tipc" => TIP_CLOSE, "dor" => DORSUM_CLOSE, "jaw" => JAW, "lip" => LIP_OPEN, "round" => LIP_ROUND,
        "velum" => VELUM, "len" => TRACT_LEN, "throat" => THROAT, "gain" => GAIN, "human" => HUMANIZE,
        "space" => SPACE, "lat" => LATERAL, "rho" => RHOTIC, _ => panic!("unknown {name}"),
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let from: f32 = args.get(2).map(|s| s.parse().unwrap()).unwrap_or(0.0);
    let to: f32 = args.get(3).map(|s| s.parse().unwrap()).unwrap_or(1e9);
    let rate = 48000.0;
    let mut v = Voice::new(rate, 11);
    let mut t = 0.0f32;
    println!("    t   peak  minA  path   po   fric  burst voice  asp  noiseIx");
    for step in args[1].split(';') {
        let mut parts = step.trim().splitn(2, ' ');
        let secs: f32 = parts.next().unwrap().parse().unwrap();
        if let Some(assign) = parts.next() {
            for kv in assign.split(',') {
                let (k, val) = kv.split_once('=').unwrap();
                let (k, tau) = k.split_once('@').map(|(a, b)| (a, b.parse().unwrap())).unwrap_or((k, -1.0));
                v.set(id(k.trim()), val.trim().parse().unwrap(), tau);
            }
        }
        let n = (secs * 1000.0).round() as usize;
        for _ in 0..n {
            v.render(48);
            let peak = v.out_l[..48].iter().fold(0f32, |m, x| m.max(x.abs()));
            if t >= from && t <= to {
                let s = &v.state;
                println!("{:6.3} {:5.2} {:5.3} {:5.3} {:5.2} {:5.2} {:5.2} {:5.2} {:5.2} {:3}", t, peak, s[2], v.shape.path_area, s[5], s[6], s[17], s[7], s[16], s[19]);
            }
            t += 0.001;
        }
    }
}
