//! Fit articulatory vowel targets so the model's own resonances match
//! published adult-female mean formants (Hillenbrand, Getty, Clark & Wheeler,
//! 1995, J. Acoust. Soc. Am. 97(5), Table V). Prints JSON for the planner.
//!
//! cargo run --release --bin calibrate > ../src/core/vowels.generated.json

use voice_lab_engine::analysis::tract_response;
use voice_lab_engine::params::*;
use voice_lab_engine::tract::{area_function, N};

struct Target {
    symbol: &'static str,
    formants: [f32; 3],
    /// Prior articulation: tongue x, tongue y, jaw, lip open, lip round.
    prior: [f32; 6],
    retroflex: bool,
}

const TARGETS: [Target; 12] = [
    Target { symbol: "IY", formants: [437.0, 2761.0, 3372.0], prior: [0.95, 0.95, 0.25, 0.55, 0.0, 0.85], retroflex: false },
    Target { symbol: "IH", formants: [483.0, 2365.0, 3053.0], prior: [0.82, 0.78, 0.35, 0.55, 0.05, 0.7], retroflex: false },
    Target { symbol: "EY", formants: [536.0, 2530.0, 3047.0], prior: [0.85, 0.7, 0.4, 0.6, 0.0, 0.75], retroflex: false },
    Target { symbol: "EH", formants: [731.0, 2058.0, 2979.0], prior: [0.75, 0.45, 0.6, 0.65, 0.05, 0.55], retroflex: false },
    Target { symbol: "AE", formants: [669.0, 2349.0, 2972.0], prior: [0.85, 0.2, 0.75, 0.7, 0.0, 0.4], retroflex: false },
    Target { symbol: "AA", formants: [936.0, 1551.0, 2815.0], prior: [0.25, 0.1, 0.9, 0.8, 0.1, 0.15], retroflex: false },
    Target { symbol: "AO", formants: [781.0, 1136.0, 2824.0], prior: [0.15, 0.3, 0.7, 0.45, 0.6, 0.25], retroflex: false },
    Target { symbol: "OW", formants: [555.0, 1035.0, 2828.0], prior: [0.2, 0.6, 0.5, 0.35, 0.8, 0.45], retroflex: false },
    Target { symbol: "UH", formants: [519.0, 1225.0, 2827.0], prior: [0.35, 0.75, 0.35, 0.4, 0.55, 0.55], retroflex: false },
    Target { symbol: "UW", formants: [459.0, 1105.0, 2735.0], prior: [0.3, 0.9, 0.25, 0.25, 0.95, 0.65], retroflex: false },
    Target { symbol: "AH", formants: [753.0, 1426.0, 2933.0], prior: [0.4, 0.35, 0.65, 0.65, 0.15, 0.35], retroflex: false },
    Target { symbol: "ER", formants: [523.0, 1588.0, 1929.0], prior: [0.5, 0.6, 0.4, 0.45, 0.4, 0.4], retroflex: true },
];

fn params_for(x: &[f32], retroflex: bool) -> [f32; COUNT] {
    let mut p = [0.0f32; COUNT];
    for (i, s) in SPECS.iter().enumerate() {
        p[i] = s.default;
    }
    p[TONGUE_X] = x[0];
    p[TONGUE_Y] = x[1];
    p[JAW] = x[2];
    p[LIP_OPEN] = x[3];
    p[LIP_ROUND] = x[4];
    p[THROAT] = x[5];
    p[TIP_CLOSE] = 0.0;
    if retroflex {
        p[RHOTIC] = x[6];
    }
    p
}

fn formants(p: &[f32; COUNT]) -> [f32; 5] {
    let mut areas = [0.0f32; N];
    let shape = area_function(p, &mut areas);
    let r = tract_response(&areas, shape.nasal_area, shape.length_cm);
    let mut f = [0.0; 5];
    for (k, (hz, _)) in r.formants.iter().enumerate() {
        f[k] = *hz;
    }
    f
}

fn cost(x: &[f32], t: &Target) -> f32 {
    if x.iter().any(|v| !(0.0..=1.0).contains(v)) {
        return 1e6;
    }
    let f = formants(&params_for(x, t.retroflex));
    if f[2] <= 0.0 {
        return 1e5;
    }
    let mut c = 0.0;
    for k in 0..3 {
        let w = [1.0, 1.0, if t.retroflex { 1.2 } else { 0.4 }][k];
        c += w * (f[k] / t.formants[k]).ln().powi(2) * 100.0;
    }
    // Keep articulations plausible for the portrait: jaw and lips matter most.
    let weights = [0.2, 0.2, 2.4, 1.2, 1.2, 0.2];
    for k in 0..6 {
        c += weights[k] * (x[k] - t.prior[k]).powi(2);
    }
    c
}

fn nelder_mead(start: &[f32], t: &Target) -> (Vec<f32>, f32) {
    let n = start.len();
    let mut simplex: Vec<Vec<f32>> = vec![start.to_vec()];
    for i in 0..n {
        let mut v = start.to_vec();
        v[i] = if v[i] > 0.5 { v[i] - 0.15 } else { v[i] + 0.15 };
        simplex.push(v);
    }
    let mut values: Vec<f32> = simplex.iter().map(|v| cost(v, t)).collect();
    for _ in 0..600 {
        let mut order: Vec<usize> = (0..=n).collect();
        order.sort_by(|a, b| values[*a].partial_cmp(&values[*b]).unwrap());
        simplex = order.iter().map(|i| simplex[*i].clone()).collect();
        values = order.iter().map(|i| values[*i]).collect();
        let centroid: Vec<f32> = (0..n).map(|j| simplex[..n].iter().map(|v| v[j]).sum::<f32>() / n as f32).collect();
        let at = |a: f32| -> Vec<f32> { (0..n).map(|j| centroid[j] + a * (simplex[n][j] - centroid[j])).collect() };
        let reflected = at(-1.0);
        let fr = cost(&reflected, t);
        if fr < values[0] {
            let expanded = at(-2.0);
            let fe = cost(&expanded, t);
            if fe < fr {
                simplex[n] = expanded;
                values[n] = fe;
            } else {
                simplex[n] = reflected;
                values[n] = fr;
            }
        } else if fr < values[n - 1] {
            simplex[n] = reflected;
            values[n] = fr;
        } else {
            let contracted = at(0.5);
            let fc = cost(&contracted, t);
            if fc < values[n] {
                simplex[n] = contracted;
                values[n] = fc;
            } else {
                for i in 1..=n {
                    simplex[i] = (0..n).map(|j| simplex[0][j] + 0.5 * (simplex[i][j] - simplex[0][j])).collect();
                    values[i] = cost(&simplex[i], t);
                }
            }
        }
    }
    let best = (0..=n).min_by(|a, b| values[*a].partial_cmp(&values[*b]).unwrap()).unwrap();
    (simplex[best].clone(), values[best])
}

fn main() {
    let results: Vec<String> = std::thread::scope(|scope| {
        let handles: Vec<_> = TARGETS.iter().map(|t| scope.spawn(move || fit(t))).collect();
        handles.into_iter().map(|h| h.join().unwrap()).collect()
    });
    println!("{{\n{}\n}}", results.join(",\n"));
}

fn fit(t: &Target) -> String {
    {
        let mut start = t.prior.to_vec();
        if t.retroflex {
            start.extend_from_slice(&[0.8]);
        }
        let (mut best, mut best_cost) = nelder_mead(&start, t);
        // Restart from the result to escape shallow simplex collapse.
        for _ in 0..3 {
            let (x, c) = nelder_mead(&best, t);
            if c < best_cost - 1e-4 {
                best = x;
                best_cost = c;
            } else {
                break;
            }
        }
        let f = formants(&params_for(&best, t.retroflex));
        eprintln!(
            "{:>2}: F1 {:>5.0}/{:>4.0}  F2 {:>5.0}/{:>4.0}  F3 {:>5.0}/{:>4.0}  cost {:.4}  x {:?}",
            t.symbol, f[0], t.formants[0], f[1], t.formants[1], f[2], t.formants[2], best_cost,
            best.iter().map(|v| (v * 1000.0).round() / 1000.0).collect::<Vec<_>>()
        );
        let mut fields = vec![
            format!("\"tongueX\":{:.3}", best[0]),
            format!("\"tongueY\":{:.3}", best[1]),
            format!("\"jaw\":{:.3}", best[2]),
            format!("\"lipOpen\":{:.3}", best[3]),
            format!("\"lipRound\":{:.3}", best[4]),
            format!("\"throat\":{:.3}", best[5]),
        ];
        if t.retroflex {
            fields.push(format!("\"rhotic\":{:.3}", best[6]));
        }
        return format!(
            "  \"{}\": {{\"params\":{{{}}},\"model\":[{:.0},{:.0},{:.0}],\"target\":[{:.0},{:.0},{:.0}]}}",
            t.symbol,
            fields.join(","),
            f[0], f[1], f[2], t.formants[0], t.formants[1], t.formants[2]
        );
    }
}
