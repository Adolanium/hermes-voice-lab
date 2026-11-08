"""Hermes Voice Lab agent tools. No model or network service is required."""
import json
from subprocess import TimeoutExpired
from gateway.session_context import get_session_env
from .voice_backend import patch_project, render_project


def _scope(args):
    session_id = args.get("session_id", "")
    current = get_session_env("HERMES_SESSION_ID")
    if current and session_id != current:
        raise ValueError("session_id must match the active conversation")
    return session_id, args.get("project_id", "")


def _patch(args, **kwargs):
    try:
        session_id, project_id = _scope(args)
        project = patch_project(session_id, project_id, args.get("patch", {}), args.get("project"))
        return json.dumps({"ok":True,"session_id":session_id,"project_id":project_id,"project":project})
    except (ValueError, TypeError, OSError) as error:
        return json.dumps({"ok":False,"error":str(error)})


def _render(args, **kwargs):
    try:
        session_id, project_id = _scope(args)
        result = render_project(session_id, project_id)
        return json.dumps({"ok":True, **result}) + "\n" + result["media"]
    except (ValueError, TypeError, OSError, RuntimeError, TimeoutExpired) as error:
        return json.dumps({"ok":False,"error":str(error)})


def register(ctx):
    common = {"session_id":{"type":"string","description":"Active durable Hermes conversation ID. Required; cannot target another conversation."},
              "project_id":{"type":"string","description":"Project ID, usually main."}}
    for name, description, handler, extra in (
        ("voice_lab_patch", "Create or update the active conversation's vocal synthesizer patch. Send a full project to change timed events; desktop updates live.", _patch,
         {"patch":{"type":"object","description":"Parameters: tongueX, tongueY, jaw, lip, breath, vibrato, gain, gate, voicing, frication, nasal within 0–1; pitch 80–400 Hz."},
          "project":{"type":"object","description":"Optional complete project: version 1, name, patch, events [{time,duration,params}], optional text, bpm, sequence."}}),
        ("voice_lab_render", "Render a saved vocal project to a WAV attachment using the same local Rust WASM engine as the desktop. Maximum 60 seconds.", _render, {}),
    ):
        ctx.register_tool(name=name, toolset="voice_lab", description=description,
                          schema={"name":name,"description":description,"parameters":{"type":"object","properties":{**common,**extra},"required":["session_id","project_id"],"additionalProperties":False}},
                          handler=handler)
