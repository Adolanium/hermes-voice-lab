//! Render short diagnostic WAVs: cargo run --release --bin probe -- out.wav <script>
//! Script: semicolon-separated "seconds param=value,param=value".
use std::io::Write;
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
    let rate = 48000.0;
    let mut v = Voice::new(rate, 11);
    let mut samples: Vec<f32> = Vec::new();
    for step in args[2].split(';') {
        let mut parts = step.trim().splitn(2, ' ');
        let secs: f32 = parts.next().unwrap().parse().unwrap();
        if let Some(assign) = parts.next() {
            for kv in assign.split(',') {
                let (k, val) = kv.split_once('=').unwrap();
                v.set(id(k.trim()), val.trim().parse().unwrap(), -1.0);
            }
        }
        let mut remaining = (secs * rate) as usize;
        while remaining > 0 {
            let n = remaining.min(1024);
            v.render(n);
            samples.extend_from_slice(&v.out_l[..n]);
            remaining -= n;
        }
    }
    let rms = (samples.iter().map(|x| x * x).sum::<f32>() / samples.len() as f32).sqrt();
    let peak = samples.iter().fold(0f32, |m, x| m.max(x.abs()));
    eprintln!("rms {rms:.4} peak {peak:.4} resets {}", v.state[15]);
    let mut f = std::fs::File::create(&args[1]).unwrap();
    let data_len = (samples.len() * 2) as u32;
    f.write_all(b"RIFF").unwrap();
    f.write_all(&(36 + data_len).to_le_bytes()).unwrap();
    f.write_all(b"WAVEfmt ").unwrap();
    f.write_all(&16u32.to_le_bytes()).unwrap();
    f.write_all(&1u16.to_le_bytes()).unwrap();
    f.write_all(&1u16.to_le_bytes()).unwrap();
    f.write_all(&(rate as u32).to_le_bytes()).unwrap();
    f.write_all(&((rate as u32) * 2).to_le_bytes()).unwrap();
    f.write_all(&2u16.to_le_bytes()).unwrap();
    f.write_all(&16u16.to_le_bytes()).unwrap();
    f.write_all(b"data").unwrap();
    f.write_all(&data_len.to_le_bytes()).unwrap();
    for s in samples {
        f.write_all(&((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes()).unwrap();
    }
}
