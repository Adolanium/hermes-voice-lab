"""Shared service for Hermes Voice Lab: validation, per-conversation project
storage, desktop events and offline rendering with the shipped Node runtime.

Used by the agent tools (``__init__.py``) and the desktop REST routes
(``dashboard/plugin_api.py``). Rendering runs ``runtime/render.mjs`` with a fixed
argument list (no shell); it loads the same WebAssembly engine and planner
that Desktop plays live.
"""
from __future__ import annotations

import copy
import json
import math
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

PLUGIN_ID = "hermes-voice-lab"
ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / "runtime"
_LOCK = threading.RLock()
_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}")
MODES = ("play", "speak", "sing", "beat", "ensemble")
RENDER_TIMEOUT = 120


@lru_cache(maxsize=1)
def catalog() -> dict:
    return json.loads((RUNTIME / "catalog.json").read_text())


def _params() -> dict[str, dict]:
    return {p["name"]: p for p in catalog()["params"]}


def _data_dir() -> Path:
    from plugins.plugin_storage import plugin_data_dir
    return plugin_data_dir(PLUGIN_ID)


def _broadcast(event: str, payload: dict) -> None:
    try:
        from hermes_cli.plugin_events import broadcast_plugin_event
        broadcast_plugin_event(PLUGIN_ID, event, payload)
    except Exception:  # Events accelerate the UI; storage stays authoritative.
        pass


def identity(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _ID.fullmatch(value) or ".." in value:
        raise ValueError(f"Invalid {label}: use 1–128 letters, digits, '_', '-', '.' or ':'")
    return value


def _number(value: Any, low: float, high: float, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{label} must be a number from {low} to {high}")
    return float(value)


def validate_patch(patch: Any, label: str = "patch") -> dict:
    if patch is None:
        return {}
    if not isinstance(patch, dict):
        raise ValueError(f"{label} must be an object of parameter values")
    specs = _params()
    out = {}
    for key, value in patch.items():
        spec = specs.get(key)
        if spec is None:
            raise ValueError(f"Unknown parameter {key!r}. Known: {', '.join(sorted(specs))}")
        out[key] = _number(value, spec["min"], spec["max"], key)
    return out


NOTE = re.compile(r"^([A-Ga-g])([#b]?)(-?\d)$")


def note_to_midi(text: str) -> int:
    m = NOTE.match(text.strip())
    if not m:
        raise ValueError(f"Invalid note name {text!r}; use names like C4, F#4 or Bb3")
    base = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[m.group(1).upper()]
    base += {"#": 1, "b": -1, "": 0}[m.group(2)]
    return (int(m.group(3)) + 1) * 12 + base


def parse_melody(melody: str) -> list[dict]:
    """'C4:1 D4:0.5 r:0.5 E4:2' → notes in beats ('r' is a rest)."""
    notes, beat = [], 0.0
    for token in melody.split():
        name, _, length = token.partition(":")
        beats = _number(float(length) if length else 1.0, 0.0625, 64, f"length of {token}")
        if name.lower() not in ("r", "rest", "-"):
            notes.append({"start": beat, "length": beats, "midi": note_to_midi(name)})
        beat += beats
    return notes


def validate_notes(notes: Any, max_start: int = 1024) -> list[dict]:
    limits = catalog()["limits"]
    if not isinstance(notes, list) or len(notes) > limits["notes"]:
        raise ValueError(f"notes must be a list of at most {limits['notes']} items")
    out = []
    for i, n in enumerate(notes):
        if not isinstance(n, dict):
            raise ValueError(f"note {i} must be an object")
        midi = n.get("midi")
        if midi is None and isinstance(n.get("note"), str):
            midi = note_to_midi(n["note"])
        out.append({
            "start": _number(n.get("start"), 0, max_start, f"note {i} start"),
            "length": _number(n.get("length"), 0.0625, 64, f"note {i} length"),
            "midi": int(round(_number(midi, 36, 96, f"note {i} midi"))),
        })
    return out


def word_key(text: str) -> str:
    return re.sub(r'[-.,!?:;“”"]', '', unicodedata.normalize("NFC", text).lower().removeprefix("[").removesuffix("]"))


def validate_directions(items: Any) -> list[dict]:
    if not isinstance(items, list) or len(items) > 256:
        raise ValueError("Expected up to 256 word directions")
    seen, out = set(), []
    for item in items:
        if not isinstance(item, dict) or set(item) - {"word", "occurrence", "swell", "slide", "vibratoAt"}:
            raise ValueError("Invalid word direction")
        word = item.get("word")
        occurrence = item.get("occurrence", 1)
        if (not isinstance(word, str) or not word_key(word) or len(word) > 120 or re.search(r"\s", word)
                or type(occurrence) is not int or not 1 <= occurrence <= 2048):
            raise ValueError("A direction needs a lyric word and a positive occurrence")
        key = (word_key(word), occurrence)
        if key in seen:
            raise ValueError("Duplicate word direction")
        seen.add(key)
        direction = {"word": key[0], "occurrence": occurrence}
        for field in ("swell", "slide"):
            if field in item and type(item[field]) is not bool:
                raise ValueError(f"{field} must be boolean")
            if item.get(field):
                direction[field] = True
        if "vibratoAt" in item:
            direction["vibratoAt"] = _number(item["vibratoAt"], 0, 1, "vibratoAt")
        out.append(direction)
    return out


def validate_take_part(part: Any) -> dict:
    if not isinstance(part, dict):
        raise ValueError("Expected a jam take part")
    notes = validate_notes(part.get("notes"))
    bpm = _number(part.get("bpm"), 30, 240, "take bpm")
    lyrics, style = part.get("lyrics"), part.get("style")
    if not isinstance(lyrics, str) or len(lyrics) > 8000 or style not in ("natural", "cartoon", "yodel"):
        raise ValueError("Invalid take lyrics or style")
    if any((n["start"] + n["length"]) * 60 / bpm > 360 for n in notes):
        raise ValueError("Take part exceeds six minutes")
    out = dict(notes=notes, lyrics=lyrics, bpm=bpm, style=style, voice=validate_patch(part.get("voice")))
    if "shape" in part:
        out["shape"] = validate_patch(part["shape"])
    directions = validate_directions(part.get("directions", []))
    if directions:
        out["directions"] = directions
    return out


def validate_takes(takes: Any) -> list[dict]:
    if not isinstance(takes, list) or len(takes) > 12:
        raise ValueError("Expected up to 12 jam takes")
    out, ids = [], set()
    for take in takes:
        if not isinstance(take, dict) or not isinstance(take.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", take["id"]) or take["id"] in ids:
            raise ValueError("Invalid or duplicate jam take ID")
        ids.add(take["id"])
        call, reply = [validate_take_part(take.get(k)) for k in ("call", "reply")]
        duration = sum(max((n["start"] + n["length"] for n in p["notes"]), default=0) * 60 / p["bpm"] for p in (call, reply))
        if len(call["notes"]) + len(reply["notes"]) > 2048 or duration > 360:
            raise ValueError("A take can contain up to 2,048 notes and six minutes of music")
        out.append(dict(id=take["id"], call=call, reply=reply))
    return out


def validate_ensemble(e: Any) -> dict:
    if not isinstance(e, dict) or not isinstance(e.get("title"), str) or not 1 <= len(e["title"].strip()) <= 120 or len(e["title"]) > 120:
        raise ValueError("Give the arrangement a title of 1–120 characters")
    bpm = _number(e.get("bpm"), 30, 240, "bpm")
    if not isinstance(e.get("singers"), list) or not 1 <= len(e["singers"]) <= 3:
        raise ValueError("Choose one to three singers")
    singers = []
    voices = {v["id"] for v in catalog()["voicePresets"]}
    colors = catalog()["avatarColors"]
    movements = catalog()["movements"]
    expressions = catalog()["expressions"]
    for i, s in enumerate(e["singers"]):
        if not isinstance(s, dict) or not isinstance(s.get("name"), str) or not s["name"].strip() or len(s["name"]) > 40 or s.get("voice") not in voices:
            raise ValueError("Each singer needs a name and voice preset")
        if not isinstance(s.get("lyrics"), str) or len(s["lyrics"]) > 8000 or not isinstance(s.get("muted"), bool):
            raise ValueError("Invalid singer lyrics or mute setting")
        notes = sorted(validate_notes(s.get("notes"), max_start=1440), key=lambda n: n["start"])
        end = 0
        for n in notes:
            if n["start"] < end - 0.000001:
                raise ValueError("Each singer can play one note at a time")
            end = n["start"] + n["length"]
        if end > bpm * 6:
            raise ValueError("Parts can last up to six minutes")
        color = s.get("avatarColor", colors[i])
        if color not in colors:
            raise ValueError("Unknown Nous Girl avatar color")
        movement = s.get("movement", movements[i])
        if movement not in movements:
            raise ValueError("Unknown singer movement")
        expression = s.get("expression", expressions[i])
        if expression not in expressions:
            raise ValueError("Unknown singer expression")
        singers.append(dict(name=s["name"], voice=s["voice"], avatarColor=color, movement=movement, expression=expression, lyrics=s["lyrics"], muted=s["muted"], notes=notes,
                            level=_number(s.get("level"), 0, 1, "level"), pan=_number(s.get("pan"), -1, 1, "pan")))
    out = dict(title=e["title"], bpm=bpm, singers=singers)
    if "excerpt" in e:
        clip = e["excerpt"]
        if not isinstance(clip, dict):
            raise ValueError("Invalid excerpt")
        start = _number(clip.get("start"), 0, 362, "excerpt start")
        end = _number(clip.get("end"), 0, 362, "excerpt end")
        last = max((n["start"] + n["length"] for s in singers for n in s["notes"]), default=0)
        if end <= start or start >= last * 60 / bpm + 0.65:
            raise ValueError("Choose an excerpt inside the arrangement")
        out["excerpt"] = dict(start=start, end=end)
    return out


def validate_project(project: Any) -> dict:
    """Structural validation mirroring src/core/project.ts (the renderer re-validates)."""
    if not isinstance(project, dict) or len(json.dumps(project, allow_nan=False)) > 1_000_000:
        raise ValueError("Project must be an object smaller than 1 MB")
    allowed = {"version", "name", "mode", "voice", "shape", "speech", "song", "beat", "sustain", "takes", "activeTake", "ensemble"}
    unknown = set(project) - allowed
    if unknown:
        raise ValueError(f"Unknown project fields: {', '.join(sorted(unknown))}")
    base = copy.deepcopy(catalog()["defaultProject"])
    limits = catalog()["limits"]
    out = copy.deepcopy(base)
    out["name"] = project.get("name", base["name"])
    if not isinstance(out["name"], str) or len(out["name"]) > limits["name"]:
        raise ValueError("name must be text up to 120 characters")
    out["mode"] = project.get("mode", base["mode"])
    if out["mode"] not in MODES:
        raise ValueError("mode must be play, speak, sing, beat or ensemble")
    out["voice"] = {**base["voice"], **validate_patch(project.get("voice", {}), "voice")}
    out["shape"] = validate_patch(project.get("shape", base["shape"]), "shape")
    speech = {**base["speech"], **(project.get("speech") or {})}
    if not isinstance(speech.get("text"), str) or len(speech["text"]) > limits["text"]:
        raise ValueError(f"speech.text must be up to {limits['text']} characters")
    if not isinstance(speech.get("phonemes"), bool):
        raise ValueError("speech.phonemes must be true or false")
    _number(speech.get("rate"), 0.4, 2.5, "speech.rate")
    _number(speech.get("expression"), 0, 1, "speech.expression")
    out["speech"] = {k: speech[k] for k in ("text", "phonemes", "rate", "expression")}
    song = {**base["song"], **(project.get("song") or {})}
    _number(song.get("bpm"), 30, 240, "song.bpm")
    if not isinstance(song.get("lyrics"), str) or len(song["lyrics"]) > limits["lyrics"]:
        raise ValueError(f"song.lyrics must be up to {limits['lyrics']} characters")
    if not isinstance(song.get("loop"), bool):
        raise ValueError("song.loop must be true or false")
    if song.get("style", "natural") not in ("natural", "cartoon", "yodel"):
        raise ValueError("song.style must be natural, cartoon or yodel")
    song["style"] = song.get("style", "natural")
    song["notes"] = validate_notes(song.get("notes"))
    seconds = max([(n["start"] + n["length"]) * 60 / song["bpm"] for n in song["notes"]] or [0])
    if seconds > limits["seconds"]:
        raise ValueError(f"Song is longer than {limits['seconds']} seconds")
    song["duet"] = validate_duet(song.get("duet", base["song"].get("duet")))
    out["song"] = {k: song[k] for k in ("bpm", "lyrics", "notes", "loop", "style", "duet")}
    directions = validate_directions(song.get("directions", []))
    if directions:
        out["song"]["directions"] = directions
    takes = validate_takes(project.get("takes", []))
    if takes:
        out["takes"] = takes
    if "activeTake" in project:
        if not any(t["id"] == project["activeTake"] for t in takes):
            raise ValueError("Unknown active take")
        out["activeTake"] = project["activeTake"]
    if "ensemble" in project or out["mode"] == "ensemble":
        out["ensemble"] = validate_ensemble(project.get("ensemble"))
    out["beat"] = validate_beat(project.get("beat", base["beat"]))
    out["sustain"] = _number(project.get("sustain", base["sustain"]), 0.2, 30, "sustain")
    out["version"] = 2
    return out


# ---- Storage -------------------------------------------------------------------

def _session_dir(session_id: str) -> Path:
    path = _data_dir() / "sessions" / identity(session_id, "session_id")
    path.mkdir(parents=True, exist_ok=True)
    return path


def project_path(session_id: str, project_id: str) -> Path:
    folder = _session_dir(session_id) / "projects"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{identity(project_id, 'project_id')}.json"


def load_project(session_id: str, project_id: str = "main") -> dict | None:
    path = project_path(session_id, project_id)
    with _LOCK:
        if not path.exists():
            return None
        try:
            return validate_project(json.loads(path.read_text()))
        except (ValueError, json.JSONDecodeError):
            return None


DUET_PARTS = ("off", "octaveBelow", "fifthBelow", "thirdAbove", "custom")


def validate_duet(duet: Any) -> dict:
    """A second singer: part (off, octaveBelow, fifthBelow, thirdAbove, custom), a voice preset id, and for a
    written part its notes (and optional lyrics)."""
    base = {"part": "off", "voice": "baritone", "notes": [], "lyrics": ""}
    if duet is None:
        return base
    if not isinstance(duet, dict) or set(duet) - set(base):
        raise ValueError("song.duet must be an object with part, voice, notes and lyrics")
    out = {**base, **duet}
    if out["part"] not in DUET_PARTS:
        raise ValueError(f"song.duet.part must be one of {', '.join(DUET_PARTS)}")
    ids = {p["id"] for p in catalog()["voicePresets"]}
    if out["voice"] not in ids:
        raise ValueError(f"song.duet.voice must be a voice preset id: {', '.join(sorted(ids))}")
    if not isinstance(out["lyrics"], str) or len(out["lyrics"]) > 2000:
        raise ValueError("song.duet.lyrics must be text up to 2000 characters")
    out["notes"] = validate_notes(out["notes"]) if out["notes"] else []
    return out


def validate_beat(beat: Any) -> dict:
    """A beatbox pattern: bpm 50–200, 16 or 32 steps of sound ids or "" (rest), loop."""
    if not isinstance(beat, dict) or set(beat) - {"bpm", "steps", "loop"}:
        raise ValueError("beat must be an object with bpm, steps and loop")
    base = catalog()["defaultProject"]["beat"]
    out = {**base, **beat}
    _number(out.get("bpm"), 50, 200, "beat.bpm")
    ids = {s["id"] for s in catalog()["beatSounds"]}
    steps = out.get("steps")
    if not isinstance(steps, list) or len(steps) not in (16, 32):
        raise ValueError("beat.steps must be a list of 16 or 32 steps")
    clean = []
    for i, s in enumerate(steps):
        if s in ("", None, "."):
            clean.append("")
        elif isinstance(s, str) and s in ids:
            clean.append(s)
        else:
            raise ValueError(f"beat step {i} must be one of {', '.join(sorted(ids))}, or '.' for a rest")
    if not isinstance(out.get("loop"), bool):
        raise ValueError("beat.loop must be true or false")
    return {"bpm": out["bpm"], "steps": clean, "loop": out["loop"]}


def _diff(old: dict | None, new: dict) -> list[str]:
    if old is None:
        return ["project"]
    changed = [k for k in new["voice"] if old.get("voice", {}).get(k) != new["voice"][k]]
    changed += [k for k in new["shape"] if old.get("shape", {}).get(k) != new["shape"][k]]
    for section in ("speech", "song", "beat", "mode", "name", "takes", "activeTake", "ensemble"):
        if old.get(section) != new.get(section):
            changed.append(section)
    return changed


def save_project(session_id: str, project_id: str, project: Any, origin: str = "desktop", client: str | None = None) -> dict:
    project = validate_project(project)
    path = project_path(session_id, project_id)
    with _LOCK:
        previous = load_project(session_id, project_id)
        with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False, suffix=".tmp") as handle:
            json.dump(project, handle, allow_nan=False)
            temporary = Path(handle.name)
        temporary.replace(path)
    _broadcast("project.updated", {
        "session_id": session_id, "project_id": project_id, "project": project,
        "origin": origin if origin in ("agent", "desktop") else "desktop",
        "changed": _diff(previous, project), "client": client if isinstance(client, str) else None,
    })
    return project


def current_or_new(session_id: str, project_id: str = "main") -> dict:
    return load_project(session_id, project_id) or copy.deepcopy(catalog()["defaultProject"])


# ---- Rendering -----------------------------------------------------------------

def node_binary() -> str | None:
    return shutil.which("node")


def render_project(session_id: str | None, project: dict, mode: str | None = None, *, label: str = "render",
                   output_dir: Path | None = None, extra: list[str] | None = None) -> dict:
    """Render a validated project to a 48 kHz stereo WAV. Returns path + metadata."""
    project = validate_project(project)
    mode = mode or project["mode"]
    if mode not in MODES:
        raise ValueError("mode must be play, speak, sing, beat or ensemble")
    node = node_binary()
    if not node:
        raise RuntimeError("Node.js 20+ is required on the Hermes host for offline rendering")
    if output_dir is None:
        output_dir = (_session_dir(session_id) if session_id else _data_dir()) / "renders"
    output_dir.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^A-Za-z0-9]+", "-", project["name"]).strip("-").lower()[:40] or "voice"
    output = output_dir / f"{slug}-{mode}-{label}-{uuid.uuid4().hex[:8]}.wav"
    with tempfile.TemporaryDirectory(prefix="voice-lab-") as tmp:
        source = Path(tmp) / "project.json"
        source.write_text(json.dumps(project, allow_nan=False))
        argv = [node, str(RUNTIME / "render.mjs"), "--project", str(source), "--output", str(output), "--mode", mode, *(extra or [])]
        run = subprocess.run(argv, capture_output=True, text=True, timeout=RENDER_TIMEOUT, check=False)
    if run.returncode:
        raise RuntimeError(f"Renderer failed: {run.stderr.strip()[-1500:]}")
    if not output.is_file() or output.stat().st_size <= 44:
        raise RuntimeError("Renderer produced no audio")
    meta = json.loads(run.stdout.strip().splitlines()[-1])
    return {"path": str(output), "seconds": round(meta.get("seconds", 0), 3), "peak": meta.get("peak"),
            "rms": meta.get("rms"), "sample_rate": meta.get("sampleRate"), "warnings": meta.get("warnings", []), "mode": mode}


def render_text(text: str, output: Path, *, voice: str = "signature", speed: float | None = None) -> dict:
    """Read-aloud helper for the TTS provider."""
    node = node_binary()
    if not node:
        raise RuntimeError("Node.js 20+ is required for Voice Lab speech")
    argv = [node, str(RUNTIME / "render.mjs"), "--text", text, "--output", str(output), "--voice", voice, "--channels", "1"]
    if speed is not None:
        argv += ["--speed", str(max(0.4, min(2.5, float(speed))))]
    run = subprocess.run(argv, capture_output=True, text=True, timeout=RENDER_TIMEOUT, check=False)
    if run.returncode or not output.is_file():
        raise RuntimeError(f"Voice Lab speech failed: {run.stderr.strip()[-800:]}")
    return json.loads(run.stdout.strip().splitlines()[-1])


def waveform_peaks(path: str, bins: int = 120) -> list[float]:
    """Peak envelope of a rendered WAV inside this plugin's data folder (for the chat card)."""
    import array
    import wave
    target = Path(path).resolve()
    root = _data_dir().resolve()
    if not target.is_relative_to(root) or target.suffix.lower() != ".wav" or not target.is_file():
        raise ValueError("Only Voice Lab renders can be summarised")
    bins = max(16, min(512, int(bins)))
    with wave.open(str(target)) as w:
        if w.getsampwidth() != 2:
            raise ValueError("Unsupported WAV format")
        channels, frames = w.getnchannels(), w.getnframes()
        data = array.array("h", w.readframes(min(frames, 48000 * 180)))
    mono = data[::channels]
    step = max(1, len(mono) // bins)
    return [round(max((abs(v) for v in mono[i * step:(i + 1) * step]), default=0) / 32768, 4) for i in range(bins)]
