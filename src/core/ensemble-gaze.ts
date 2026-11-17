/** A glance belongs to the listening singer. Times are absolute song seconds. */
export interface Glance {
  start: number;
  end: number;
  target: number;
  answerAt?: number;
}

interface VocalPart {
  faceNotes: ReadonlyArray<{start: number; end: number}>;
  muted: boolean;
  level: number;
}

function phrases(part: VocalPart, bpm: number) {
  const spans: Array<{start: number; end: number}> = [];
  if (part.muted || part.level <= 0) return spans;
  const breath = Math.min(0.38, (0.6 * 60) / bpm);
  for (const n of part.faceNotes) {
    const last = spans[spans.length - 1];
    if (last && n.start - last.end <= breath) last.end = Math.max(last.end, n.end);
    else spans.push({start: n.start, end: n.end});
  }
  return spans;
}

/** The first active melodic lane leads during a listener's rest. A singer
 * carrying a backing line can also acknowledge a fresh melodic entrance. */
export function planGlances(parts: VocalPart[], bpm: number): Glance[][] {
  const spans = parts.map((p) => phrases(p, bpm));
  return spans.map((own, index) => {
    const result: Glance[] = [];
    if (!own.length) return result;
    const events = spans
      .flatMap((phrases, singer) =>
        phrases.flatMap((p, i) => {
          const entrance = !i || p.start - phrases[i - 1].end >= 0.72;
          return [
            {time: p.start + (singer === index ? 0 : 0.1), singer, on: true, entrance, end: p.end},
            {time: p.end + (singer === index ? 0.1 : 0.16), singer, on: false, entrance: false, end: p.end},
          ];
        })
      )
      .sort((a, b) => a.time - b.time);
    const active = parts.map(() => false);
    let target = -1,
      since = 0,
      ownIndex = -1,
      lastAcknowledgment = -Infinity;
    for (let i = 0; i < events.length; ) {
      const time = events[i].time;
      let entering: (typeof events)[number] | undefined;
      do {
        const event = events[i++];
        active[event.singer] = event.on;
        if (event.singer === index && event.on) ownIndex++;
        if (event.entrance && event.singer < index && (!entering || event.singer < entering.singer)) entering = event;
      } while (i < events.length && events[i].time === time);
      const singing = active[index];
      const current = own[ownIndex];
      if (entering && singing && time - current.start > 1.15 && time - lastAcknowledgment > 2.4) {
        const end = Math.min(time + 0.86, entering.end + 0.08, current.end - 0.08);
        if (end - time >= 0.48) {
          result.push({start: time, end, target: entering.singer});
          lastAcknowledgment = time;
        }
      }
      const next = singing ? -1 : active.findIndex((on, singer) => on && singer !== index);
      if (next === target) continue;
      // Skip rests too short to read as a deliberate look across the desk.
      if (target >= 0 && time - since >= 0.34) {
        const answer = singing ? current : own[ownIndex + 1];
        const answerAt = answer && answer.start - time <= 0.65 && next < 0 ? answer.start : undefined;
        result.push({start: since, end: time, target, answerAt});
      }
      since = time;
      target = next;
    }
    return result.sort((a, b) => a.start - b.start);
  });
}

function ease(n: number) {
  const t = Math.min(1, Math.max(0, n));
  return t * t * (3 - 2 * t);
}

export function glanceAt(track: Glance[], listener: number, time: number) {
  let lo = 0,
    hi = track.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (track[mid].start <= time) lo = mid + 1;
    else hi = mid;
  }
  const cue = track[lo - 1];
  if (!cue) return {eyes: 0, head: 0, camera: 0};
  const elapsed = time - cue.start,
    left = cue.end - time;
  const direction = Math.sign(cue.target - listener) * (Math.abs(cue.target - listener) > 1 ? 1 : 0.92);
  // The eyes find a partner first. They also make it back to the lens a
  // fraction before the shoulders finish settling for the answer.
  const eyes = direction * ease(elapsed / 0.14) * ease((left - 0.035) / 0.17);
  const head = direction * ease((elapsed - 0.07) / 0.31) * ease(left / 0.26);
  const camera = cue.answerAt === undefined ? 0 : ease((0.22 - left) / 0.18) * (1 - ease((time - cue.answerAt - 0.27) / 0.3));
  return {eyes, head, camera};
}
