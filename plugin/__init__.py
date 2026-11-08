"""Hermes Voice Lab: agent tools and an optional read-aloud (TTS) provider.

The language model sends structured instructions (parameter values, text,
notes); the local engine does all timing and synthesis. Every call is scoped
to the active conversation, so edits appear in that conversation's Voice Lab.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
from subprocess import TimeoutExpired

from . import voice_backend as vb

PROJECT_ID = "main"


def _session(args: dict) -> str:
    """Active conversation id. An explicit id must match it when one is active."""
    try:
        from gateway.session_context import get_session_env
        current = get_session_env("HERMES_SESSION_ID")
    except Exception:
        current = ""
    requested = args.get("session_id") or ""
    if current and requested and requested != current:
        raise ValueError("session_id does not match the active conversation")
    session = requested or current
    if not session:
        raise ValueError("No active conversation; pass session_id")
    return vb.identity(session, "session_id")


def _ok(**payload) -> str:
    return json.dumps({"ok": True, **payload}, ensure_ascii=False)


def _error(error: Exception) -> str:
    return json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False)


def _summary(project: dict) -> dict:
    song = project["song"]
    return {
        "name": project["name"], "mode": project["mode"], "voice": project["voice"], "shape": project["shape"],
        "speech": project["speech"],
        "song": {"bpm": song["bpm"], "lyrics": song["lyrics"], "notes": len(song["notes"]), "loop": song["loop"],
                 "style": song.get("style", "natural"), "beats": max([n["start"] + n["length"] for n in song["notes"]] or [0])},
    }


def _media(result: dict) -> str:
    return f"MEDIA:{result['path']}"


# ---- Tools -------------------------------------------------------------------

def tool_get(args: dict, **_):
    try:
        session = _session(args)
        project = vb.current_or_new(session)
        cat = vb.catalog()
        return _ok(session_id=session, project=_summary(project),
                   parameters={p["name"]: {"min": p["min"], "max": p["max"], "unit": p["unit"], "help": p["help"]} for p in cat["params"]},
                   voice_presets=[{"id": p["id"], "description": p["description"]} for p in cat["voicePresets"]],
                   vowels=[f"{v['arpabet']} /{v['ipa']}/ ({v['example']})" for v in cat["vowels"]])
    except (ValueError, OSError) as e:
        return _error(e)


def tool_set_voice(args: dict, **_):
    try:
        session = _session(args)
        project = copy.deepcopy(vb.current_or_new(session))
        cat = vb.catalog()
        preset = args.get("preset")
        if preset:
            match = next((p for p in cat["voicePresets"] if p["id"] == preset), None)
            if not match:
                raise ValueError(f"Unknown preset {preset!r}; choose from {', '.join(p['id'] for p in cat['voicePresets'])}")
            project["voice"].update(match["voice"])
        vowel = args.get("vowel")
        if vowel:
            match = next((v for v in cat["vowels"] if v["arpabet"].lower() == str(vowel).lower() or v["id"] == str(vowel).lower()), None)
            if not match:
                raise ValueError(f"Unknown vowel {vowel!r}; use one of {', '.join(v['arpabet'] for v in cat['vowels'])}")
            project["shape"] = dict(match["shape"])
            project["mode"] = "play"
        voice_keys = set(cat["voiceParams"])
        patch = vb.validate_patch(args.get("patch") or {})
        for key, value in patch.items():
            (project["voice"] if key in voice_keys else project["shape"])[key] = value
        if any(k not in voice_keys for k in patch):
            project["mode"] = "play"
        if args.get("name"):
            project["name"] = str(args["name"])[:120]
        saved = vb.save_project(session, PROJECT_ID, project, origin="agent")
        result = {"session_id": session, "project": _summary(saved), "message": "Voice updated; the Voice Lab view shows the change."}
        if args.get("render"):
            rendered = vb.render_project(session, saved, label="preview")
            return _ok(**result, render=rendered) + "\n" + _media(rendered)
        return _ok(**result)
    except (ValueError, OSError, RuntimeError, TimeoutExpired) as e:
        return _error(e)


def tool_perform(args: dict, **_):
    try:
        session = _session(args)
        project = copy.deepcopy(vb.current_or_new(session))
        mode = args.get("mode")
        if mode not in ("speak", "sing"):
            raise ValueError("mode must be 'speak' or 'sing'")
        if mode == "speak":
            text = args.get("text")
            if not isinstance(text, str) or not text.strip():
                raise ValueError("text is required to speak")
            project["speech"].update({"text": text, "phonemes": bool(args.get("phonemes", False))})
            if "rate" in args:
                project["speech"]["rate"] = vb._number(args["rate"], 0.4, 2.5, "rate")
            if "expression" in args:
                project["speech"]["expression"] = vb._number(args["expression"], 0, 1, "expression")
        else:
            if args.get("melody"):
                project["song"]["notes"] = vb.parse_melody(str(args["melody"]))
            elif args.get("notes") is not None:
                project["song"]["notes"] = vb.validate_notes(args["notes"])
            if "lyrics" in args:
                project["song"]["lyrics"] = str(args["lyrics"])
            if "bpm" in args:
                project["song"]["bpm"] = vb._number(args["bpm"], 30, 240, "bpm")
            if "loop" in args:
                project["song"]["loop"] = bool(args["loop"])
            if "style" in args:
                if args["style"] not in ("natural", "cartoon", "yodel"):
                    raise ValueError("style must be natural, cartoon or yodel")
                project["song"]["style"] = args["style"]
            if not project["song"]["notes"]:
                raise ValueError("A song needs notes (or a melody string like 'C4:1 E4:1 G4:2')")
        project["mode"] = mode
        saved = vb.save_project(session, PROJECT_ID, project, origin="agent")
        result = {"session_id": session, "project": _summary(saved),
                  "message": f"Loaded the {'phrase' if mode == 'speak' else 'song'} into Voice Lab. The user can press {'Speak' if mode == 'speak' else 'Sing'} to hear it live."}
        if args.get("render", True):
            rendered = vb.render_project(session, saved, mode=mode, label="take")
            return _ok(**result, render=rendered) + "\n" + _media(rendered)
        return _ok(**result)
    except (ValueError, OSError, RuntimeError, TimeoutExpired) as e:
        return _error(e)


def tool_render(args: dict, **_):
    try:
        session = _session(args)
        project = copy.deepcopy(vb.current_or_new(session))
        mode = args.get("mode") or project["mode"]
        variation = vb.validate_patch(args.get("variation") or {}, "variation")
        voice_keys = set(vb.catalog()["voiceParams"])
        for key, value in variation.items():
            (project["voice"] if key in voice_keys else project["shape"])[key] = value
        if args.get("name"):
            project["name"] = str(args["name"])[:120]
        rendered = vb.render_project(session, project, mode=mode, label="variation" if variation else "export")
        return _ok(session_id=session, render=rendered, variation=variation,
                   message="Rendered with the local Voice Lab engine.") + "\n" + _media(rendered)
    except (ValueError, OSError, RuntimeError, TimeoutExpired) as e:
        return _error(e)


SESSION = {"type": "string", "description": "Optional. Defaults to the active conversation; other conversations are refused."}
PATCH_HELP = ("Parameter values. Voice: pitch (50–1100 Hz), loudness, tenseness, breath, vibratoDepth, vibratoRate (3–9 Hz), "
              "tractLength (11–19 cm; child ≈12.6, woman 14.2, man ≈16.4), pharynx (0.75–1.3, throat length relative to the mouth), throat, humanize, space, gain, register (0 chest … 1 falsetto), fry, growl, twang. Shape: tongueX (back→front), tongueY (low→high), jaw, lipOpen, "
              "lipRound, tipPlace, tipClose, dorsumClose, velum, rhotic. All unitless values are 0–1.")

TOOLS = [
    ("voice_lab_get", "Read the Voice Lab state for this conversation: current voice, shape, phrase and song, plus parameter ranges, voice presets and vowels.",
     tool_get, {"session_id": SESSION}, []),
    ("voice_lab_set_voice",
     "Change the vocal synthesizer's voice or held mouth shape, e.g. breathier (raise breath, lower tenseness), brighter, deeper, a different vowel. "
     "Applies to this conversation's Voice Lab; the user sees the controls move. Optionally render a short preview WAV.",
     tool_set_voice,
     {"session_id": SESSION,
      "patch": {"type": "object", "description": PATCH_HELP, "additionalProperties": {"type": "number"}},
      "preset": {"type": "string", "description": "Voice preset id: signature, warm, bright, airy, lyric, alto."},
      "vowel": {"type": "string", "description": "Hold a vowel shape (ARPABET): IY IH EY EH AE AA AO OW UH UW AH ER, AX (schwa) or M (hum)."},
      "name": {"type": "string", "description": "Optional project name."},
      "render": {"type": "boolean", "description": "Also render a 2-second preview WAV (default false)."}},
     []),
    ("voice_lab_perform",
     "Make the voice speak a short English phrase or sing a melody with lyrics. The phrase/song is loaded into the Voice Lab view for the user to replay and edit, "
     "and (by default) rendered to a WAV attachment. Singing: give `melody` as space-separated NOTE:BEATS tokens (e.g. 'E4:0.5 G4:0.5 A4:1 r:0.5 C5:2', r = rest) "
     "or explicit `notes`, plus `lyrics` (each note takes the next syllable; hyphens split syllables; a lone '-' holds the previous vowel).",
     tool_perform,
     {"session_id": SESSION,
      "mode": {"type": "string", "enum": ["speak", "sing"]},
      "text": {"type": "string", "description": "Speak: the phrase (max 1000 chars), or ARPABET when phonemes=true (words separated by '/')."},
      "phonemes": {"type": "boolean", "description": "Speak: treat text as ARPABET phonemes."},
      "rate": {"type": "number", "description": "Speak: rate multiplier 0.4–2.5 (default 1)."},
      "expression": {"type": "number", "description": "Speak: intonation range 0–1."},
      "melody": {"type": "string", "description": "Sing: notes as NOTE:BEATS tokens."},
      "notes": {"type": "array", "items": {"type": "object", "properties": {"start": {"type": "number"}, "length": {"type": "number"}, "midi": {"type": "number"}, "note": {"type": "string"}}},
                "description": "Sing: explicit notes with start/length in beats and midi (36–96) or note name."},
      "lyrics": {"type": "string", "description": "Sing: lyrics, e.g. 'hel-lo my friend'."},
      "bpm": {"type": "number", "description": "Sing: tempo 30–240."},
      "loop": {"type": "boolean", "description": "Sing: loop in the live view."},
      "style": {"type": "string", "enum": ["natural", "cartoon", "yodel"],
                "description": "Sing: 'cartoon' scoops into notes, slides, wobbles and exaggerates the mouth for funny songs; 'yodel' flips to falsetto on the high notes and back to chest voice on the low ones (write leaps of a fifth or more, e.g. yo-de-lay-ee-hoo); 'natural' (default) is plain."},
      "render": {"type": "boolean", "description": "Render a WAV attachment (default true)."}},
     ["mode"]),
    ("voice_lab_render",
     "Render this conversation's Voice Lab project (or a variation with parameter overrides that are not saved) to a WAV file attachment.",
     tool_render,
     {"session_id": SESSION,
      "mode": {"type": "string", "enum": ["play", "speak", "sing"], "description": "Defaults to the project's current mode."},
      "variation": {"type": "object", "description": "Temporary parameter overrides for this render only. " + PATCH_HELP, "additionalProperties": {"type": "number"}},
      "name": {"type": "string", "description": "Name used in the file name."}},
     []),
]


def _check():
    return vb.node_binary() is not None


def register(ctx):
    for name, description, handler, properties, required in TOOLS:
        schema = {"name": name, "description": description,
                  "parameters": {"type": "object", "properties": properties, "required": required, "additionalProperties": False}}
        ctx.register_tool(name=name, toolset="voice_lab", schema=schema, handler=handler, check_fn=_check,
                          description=description, emoji="🎙️")
    register_tts = getattr(ctx, "register_tts_provider", None)
    if register_tts:
        try:
            from .tts import VoiceLabTTS
            register_tts(VoiceLabTTS())
        except Exception:  # Optional surface; tools still work.
            import logging
            logging.getLogger(__name__).warning("Voice Lab TTS provider not registered", exc_info=True)
