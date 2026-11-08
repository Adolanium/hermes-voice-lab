"""Shared, profile-aware project storage and offline WASM rendering."""
from __future__ import annotations

import copy
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import uuid

from plugins.plugin_storage import plugin_data_dir
from hermes_cli.plugin_events import broadcast_plugin_event

PLUGIN_ID = "hermes-voice-lab"
DEFAULT_PATCH = dict(tongueX=.58, tongueY=.42, jaw=.44, lip=.64, pitch=205,
                     breath=.16, vibrato=.12, gain=.65, gate=0, voicing=1, frication=0, nasal=0)
_LOCK = threading.RLock()


def identity(value, label):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", value) or ".." in value:
        raise ValueError(f"Invalid {label}; use 1–128 letters, numbers, _, -, ., or :")
    return value


def parameters(value):
    if not isinstance(value, dict) or set(value) - DEFAULT_PATCH.keys():
        raise ValueError("Unknown or malformed synthesis parameters")
    result = {}
    for key, number in value.items():
        low, high = (80, 400) if key == "pitch" else (0, 1)
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not low <= number <= high:
            raise ValueError(f"{key} must be a finite number between {low} and {high}")
        result[key] = number
    return result


def validate_project(project):
    if not isinstance(project, dict) or len(json.dumps(project, allow_nan=False)) > 250_000:
        raise ValueError("Project must be an object smaller than 250 KB")
    allowed = {"version", "name", "patch", "events", "text", "sequence", "bpm", "duration", "sampleRate"}
    if set(project) - allowed:
        raise ValueError("Unknown project fields")
    result = copy.deepcopy(project)
    if result.get("version", 1) != 1:
        raise ValueError("Unsupported project version")
    if not isinstance(result.get("name", "Voice study"), str) or len(result.get("name", "")) > 120:
        raise ValueError("Project name must be at most 120 characters")
    result["version"] = 1
    result.setdefault("name", "Voice study")
    result["patch"] = {**DEFAULT_PATCH, **parameters(result.get("patch", {}))}
    events = result.setdefault("events", [])
    if not isinstance(events, list) or len(events) > 1024:
        raise ValueError("Use at most 1024 events")
    for event in events:
        if not isinstance(event, dict) or set(event) != {"time", "duration", "params"}:
            raise ValueError("Each event requires time, duration, and params")
        for field in ("time", "duration"):
            number = event[field]
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not 0 <= number <= 60:
                raise ValueError("Event timing must be within 0–60 seconds")
        if event["duration"] <= 0:
            raise ValueError("Event duration must be positive")
        if event["time"] + event["duration"] > 60:
            raise ValueError("Render duration cannot exceed 60 seconds")
        event["params"] = parameters(event["params"])
    if "text" in result and (not isinstance(result["text"], str) or len(result["text"]) > 1000):
        raise ValueError("Text must be at most 1000 characters")
    for field, low, high in (("bpm", 40, 240), ("duration", .05, 60), ("sampleRate", 8000, 48000)):
        if field in result and (type(result[field]) not in (int, float) or not math.isfinite(result[field]) or not low <= result[field] <= high):
            raise ValueError(f"{field} must be within {low}–{high}")
    if "sequence" in result:
        sequence = result["sequence"]
        if not isinstance(sequence, list) or len(sequence) != 8:
            raise ValueError("Sequence must contain exactly eight steps")
        for step in sequence:
            if (not isinstance(step, dict) or set(step) != {"note", "vowel", "enabled"}
                or type(step["note"]) is not int or step["note"] not in (48,50,52,53,55,57,59,60)
                or step["vowel"] not in ("ah","ee","oo","eh","oh") or type(step["enabled"]) is not bool):
                raise ValueError("Invalid sequencer step")
    return result


def project_path(session_id, project_id):
    session_id, project_id = identity(session_id, "session_id"), identity(project_id, "project_id")
    path = plugin_data_dir(PLUGIN_ID) / "sessions" / session_id / "projects" / f"{project_id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def load_project(session_id, project_id):
    path = project_path(session_id, project_id)
    with _LOCK:
        return json.loads(path.read_text()) if path.exists() else None


def save_project(session_id, project_id, project):
    project = validate_project(project)
    path = project_path(session_id, project_id)
    with _LOCK:
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False, suffix=".tmp") as handle:
            json.dump(project, handle, allow_nan=False)
            temporary = Path(handle.name)
        temporary.replace(path)
    broadcast_plugin_event(PLUGIN_ID, "project.updated", {"session_id":session_id,"project_id":project_id,"project":project})
    return project


def patch_project(session_id, project_id, patch, project=None):
    with _LOCK:
        current = project if project is not None else load_project(session_id, project_id)
        current = current or {"version":1,"name":"Voice study","patch":DEFAULT_PATCH.copy(),"events":[]}
        current = copy.deepcopy(current)
        validated_patch = parameters(patch)
        current["patch"] = {**current.get("patch", {}), **validated_patch}
        for event in current.get("events", []):
            if isinstance(event, dict):
                event["params"] = {**event.get("params", {}), **validated_patch}
        return save_project(session_id, project_id, current)


def render_project(session_id, project_id):
    project = load_project(session_id, project_id)
    if project is None:
        raise ValueError("Project does not exist; save or patch it first")
    project = validate_project(project)
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required for offline rendering")
    renderer = Path(__file__).parent / "scripts" / "render.mjs"
    output_dir = project_path(session_id, project_id).parent.parent / "renders"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / f"{project_id}-{uuid.uuid4().hex[:12]}.wav"
    with tempfile.TemporaryDirectory(prefix="voice-lab-") as temporary:
        source = Path(temporary) / "project.json"
        source.write_text(json.dumps(project, allow_nan=False))
        run = subprocess.run([node, str(renderer), "--project", str(source), "--output", str(output)],
                             capture_output=True, text=True, timeout=90, check=False)
    if run.returncode:
        raise RuntimeError(f"Offline renderer failed: {run.stderr[-2000:]}")
    if not output.is_file() or output.stat().st_size < 44:
        raise RuntimeError("Renderer did not produce a WAV file")
    metadata = json.loads(run.stdout)
    return {"path":str(output), "media":f"MEDIA:{output}", "metadata":metadata}
