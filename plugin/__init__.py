"""Hermes Voice Lab: agent tools and an optional read-aloud (TTS) provider.

The language model sends structured instructions (parameter values, text,
notes); the local engine does all timing and synthesis. Every call is scoped
to the active conversation, so edits appear in that conversation's Voice Lab.
"""
from __future__ import annotations

import copy
import json
import re
import time
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
    takes = project.get("takes", [])
    return {
        **({"ensemble": project["ensemble"]} if project.get("ensemble") else {}),
        "active_take": project.get("activeTake"),
        "takes": [{"id": t["id"], **{k: {f: t[k].get(f) for f in ("lyrics", "bpm", "directions")} for k in ("call", "reply")}} for t in takes],
        "name": project["name"], "mode": project["mode"], "voice": project["voice"], "shape": project["shape"],
        "speech": project["speech"],
        "song": {"bpm": song["bpm"], "lyrics": song["lyrics"], "notes": len(song["notes"]), "loop": song["loop"],
                 "style": song.get("style", "natural"), "directions": song.get("directions", []), "beats": max([n["start"] + n["length"] for n in song["notes"]] or [0])},
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


def _beat_steps(pattern: str) -> tuple[list[str], str | None]:
    """Steps of a beat pattern, fitted to 16 or 32: a short bar is filled out with rests and a
    long one is cut at 32, so an agent's near-miss still plays. Returns (steps, note or None)."""
    steps = pattern.split()
    if len(steps) in (16, 32) or not steps:
        return steps, None
    if len(steps) < 32:
        size = 16 if len(steps) < 16 else 32
        return steps + ["."] * (size - len(steps)), f"The pattern had {len(steps)} steps; rests fill it out to {size}."
    return steps[:32], f"The pattern had {len(steps)} steps; it was cut to 32."


def _edit_directions(song: dict, edits: list) -> None:
    current = {(d["word"], d["occurrence"]): d for d in song.get("directions", [])}
    words = [vb.word_key(w) for w in song["lyrics"].split()]
    for direction in vb.validate_directions(edits):
        key = direction["word"], direction["occurrence"]
        if words.count(key[0]) < key[1]:
            raise ValueError(f"No occurrence {key[1]} of {key[0]!r} in these lyrics")
        if len(direction) == 2:
            current.pop(key, None)
        else:
            current[key] = direction
    song["directions"] = list(current.values())


def _keep_turn(session: str, turn_id: str) -> dict:
    if not isinstance(turn_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", turn_id):
        raise ValueError("Invalid jam turn ID")
    project = vb.current_or_new(session)
    if any(t["id"] == turn_id for t in project.get("takes", [])):
        return project
    if len(project.get("takes", [])) >= 12:
        raise ValueError("All 12 take slots are in use")
    # The desktop holds unkept exchanges. Wait for its normal durable save before
    # applying further edits, including when Desktop and agent use different processes.
    vb._broadcast("jam.keep", {"session_id": session, "turn_id": turn_id})
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        time.sleep(0.1)
        project = vb.current_or_new(session)
        if any(t["id"] == turn_id for t in project.get("takes", [])):
            return project
    raise ValueError("Could not confirm the take was saved. Open the conversation’s Voice Lab and check its jam exchanges.")


def tool_perform(args: dict, **_):
    try:
        session = _session(args)
        project = copy.deepcopy(vb.current_or_new(session))
        mode = args.get("mode")
        if mode not in ("speak", "sing", "beat", "ensemble"):
            raise ValueError("mode must be 'speak', 'sing', 'beat' or 'ensemble'")
        if mode == "speak":
            text = args.get("text")
            if not isinstance(text, str) or not text.strip():
                raise ValueError("text is required to speak")
            project["speech"].update({"text": text, "phonemes": bool(args.get("phonemes", False))})
            if "rate" in args:
                project["speech"]["rate"] = vb._number(args["rate"], 0.4, 2.5, "rate")
            if "expression" in args:
                project["speech"]["expression"] = vb._number(args["expression"], 0, 1, "expression")
        elif mode == "ensemble":
            arrangement = project.get("ensemble") or copy.deepcopy(vb.catalog()["defaultEnsemble"])
            if "bpm" in args:
                arrangement["bpm"] = args["bpm"]
            if "title" in args:
                arrangement["title"] = args["title"]
            if "singers" in args:
                singers = []
                for part in args["singers"]:
                    s = dict(level=0.8, pan=0, muted=False)
                    s.update(part)
                    if "melody" in s:
                        s["notes"] = vb.parse_melody(s.pop("melody"))
                    singers.append(s)
                arrangement["singers"] = singers
                arrangement.pop("excerpt", None)
            if "excerpt" in args:
                if args["excerpt"] is None:
                    arrangement.pop("excerpt", None)
                else:
                    arrangement["excerpt"] = args["excerpt"]
            project["ensemble"] = vb.validate_ensemble(arrangement)
        elif mode == "beat":
            beat = dict(project.get("beat") or {})
            fitted = None
            if args.get("pattern"):
                beat["steps"], fitted = _beat_steps(str(args["pattern"]))
            if "bpm" in args:
                beat["bpm"] = args["bpm"]
            if "loop" in args:
                beat["loop"] = bool(args["loop"])
            project["beat"] = vb.validate_beat(beat)
        else:
            if "keep_turn" in args:
                if args.get("take_id", args["keep_turn"]) != args["keep_turn"]:
                    raise ValueError("keep_turn and take_id must refer to the same exchange")
                project = _keep_turn(session, args["keep_turn"])
            take_id = args.get("keep_turn", args.get("take_id", project.get("activeTake")))
            take = next((t for t in project.get("takes", []) if t["id"] == take_id), None)
            if take_id and take_id != "song" and take is None:
                raise ValueError("Unknown take_id. Read voice_lab_get for saved takes.")
            side = args.get("take_part", "reply")
            if side not in ("call", "reply") or ("take_part" in args and not take):
                raise ValueError("take_part requires a saved take and must be call or reply")
            if take:
                if any(k in args for k in ("duet", "second_voice", "second_melody", "loop")):
                    raise ValueError("Duet and loop controls apply to the main song")
                project["activeTake"] = take["id"]
            else:
                project.pop("activeTake", None)
            song = take[side] if take else project["song"]
            if args.get("melody"):
                song["notes"] = vb.parse_melody(str(args["melody"]))
            elif args.get("notes") is not None:
                song["notes"] = vb.validate_notes(args["notes"])
            if "lyrics" in args:
                song["lyrics"] = str(args["lyrics"])
            if "directions" in args:
                _edit_directions(song, args["directions"])
            if "bpm" in args:
                song["bpm"] = vb._number(args["bpm"], 30, 240, "bpm")
            if "loop" in args:
                song["loop"] = bool(args["loop"])
            if "duet" in args or "second_voice" in args or "second_melody" in args:
                duet = dict(song.get("duet") or {})
                if "duet" in args:
                    duet["part"] = args["duet"]
                if "second_voice" in args:
                    duet["voice"] = args["second_voice"]
                if args.get("second_melody"):
                    duet["part"] = "custom"
                    duet["notes"] = vb.parse_melody(str(args["second_melody"]))
                    duet["lyrics"] = str(args.get("second_lyrics", ""))
                song["duet"] = vb.validate_duet(duet)
            if "style" in args:
                if args["style"] not in ("natural", "cartoon", "yodel"):
                    raise ValueError("style must be natural, cartoon or yodel")
                song["style"] = args["style"]
            if not song["notes"]:
                raise ValueError("A song needs notes (or a melody string like 'C4:1 E4:1 G4:2')")
        project["mode"] = mode
        saved = vb.save_project(session, PROJECT_ID, project, origin="agent")
        result = {"session_id": session, "project": _summary(saved),
                  "message": f"Loaded the {dict(speak='phrase', sing='song', beat='beat', ensemble='arrangement')[mode]} into Voice Lab. The user can press {dict(speak='Speak', sing='Sing', beat='Play', ensemble='Play arrangement')[mode]} to hear it live."}
        if mode == "beat" and fitted:
            result["note"] = fitted
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
        if mode == "sing" and project.get("activeTake"):
            take = next(t for t in project["takes"] if t["id"] == project["activeTake"])
            for part in (take["call"], take["reply"]):
                part["voice"].update({k: v for k, v in variation.items() if k in voice_keys})
                if "shape" in part:
                    part["shape"].update({k: v for k, v in variation.items() if k not in voice_keys})
        if args.get("name"):
            project["name"] = str(args["name"])[:120]
        rendered = vb.render_project(session, project, mode=mode, label="variation" if variation else "export")
        return _ok(session_id=session, render=rendered, variation=variation,
                   message="Rendered with the local Voice Lab engine.") + "\n" + _media(rendered)
    except (ValueError, OSError, RuntimeError, TimeoutExpired) as e:
        return _error(e)


JAM_NOTES, JAM_BEATS = 32, 32


def tool_jam(args: dict, **_):
    """Sing an answer to the user's phrase now. Nothing is saved: the open Voice Lab view sings it."""
    try:
        session = _session(args)
        melody = args.get("melody")
        if not isinstance(melody, str) or not melody.strip():
            raise ValueError("melody is required, as NOTE:BEATS tokens such as 'E4:0.5 G4:0.5 A4:1'")
        notes = vb.parse_melody(melody)
        if not notes:
            raise ValueError("The answer needs at least one note")
        if len(notes) > JAM_NOTES:
            raise ValueError(f"Keep a jam answer to {JAM_NOTES} notes or fewer")
        beats = max(n["start"] + n["length"] for n in notes)
        if beats > JAM_BEATS:
            raise ValueError(f"Keep a jam answer within {JAM_BEATS} beats")
        for n in notes:
            n["midi"] = int(round(vb._number(n["midi"], 36, 96, "note")))
        bpm = vb._number(args.get("bpm", 96), 30, 240, "bpm")
        lyrics = str(args.get("lyrics") or "")[:400]
        turn_id = args.get("turn_id")
        if turn_id is not None and (not isinstance(turn_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", turn_id)):
            raise ValueError("Invalid jam turn_id")
        vb._broadcast("jam", {"session_id": session, "notes": notes, "lyrics": lyrics, "bpm": bpm,
                              **({"turn_id": turn_id} if turn_id else {})})
        return _ok(session_id=session, turn_id=turn_id, notes=len(notes), beats=beats,
                   message="She is singing your answer in Voice Lab now. Say at most one short line, or nothing.")
    except ValueError as e:
        return _error(e)


SESSION = {"type": "string", "description": "Optional. Defaults to the active conversation; other conversations are refused."}
PATCH_HELP = ("Parameter values. Voice: pitch (50–1100 Hz), loudness, tenseness, breath, vibratoDepth, vibratoRate (3–9 Hz), "
              "tractLength (11–19 cm; child ≈12.6, woman 14.2, man ≈16.4), pharynx (0.75–1.3, throat length relative to the mouth), throat, humanize, space, gain, register (0 chest … 1 falsetto), fry, growl, twang; recording chain: mic (0 close … 1 far, 0.4 neutral), eqLow/eqMid/eqHigh (−12…12 dB), comp, drive. Shape: tongueX (back→front), tongueY (low→high), jaw, lipOpen, "
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
     "Make the voice speak a short phrase (English, Russian or Korean), sing a melody with lyrics, beatbox a pattern, or arrange up to three independent singers in the clip studio. The phrase/song is loaded into the Voice Lab view for the user to replay and edit, "
     "and (by default) rendered to a WAV attachment. Singing: give `melody` as space-separated NOTE:BEATS tokens (e.g. 'E4:0.5 G4:0.5 A4:1 r:0.5 C5:2', r = rest) "
     "or explicit `notes`, plus `lyrics` (each note takes the next syllable; hyphens split syllables; a lone '-' holds the previous vowel; "
     "a bracketed phoneme group such as [T+S] or [PE] is one syllable sung as written). Beat: `pattern` of 16 or 32 steps (16ths), each one of "
     "kick, snare, hat, open, click, bass, hum, or '.' for a rest, e.g. 'kick . hat . snare . hat . kick kick hat . snare . hat .'.",
     tool_perform,
     {"session_id": SESSION,
      "mode": {"type": "string", "enum": ["speak", "sing", "beat", "ensemble"]},
      "title": {"type": "string", "description": "Ensemble arrangement title."},
      "excerpt": {"type": ["object","null"], "description": "Ensemble clip in seconds, or null for the whole song.",
                  "properties": {"start":{"type":"number"}, "end":{"type":"number"}}, "required":["start","end"]},
      "singers": {"type": "array", "minItems": 1, "maxItems": 3, "description": "Replace all arrangement parts. Omit to keep the arrangement or load Night Wire.",
                  "items": {"type": "object", "required": ["name","voice","lyrics","melody"], "properties": {
                      "expression":{"type":"string","enum":list(vb.catalog()["expressions"]),"description":"How the eyes and brows respond to sung accents, pitches and held notes."},
                      "movement":{"type":"string","enum":list(vb.catalog()["movements"]),"description":"How this singer moves to the beat."},
                      "avatarColor":{"type":"string","enum":list(vb.catalog()["avatarColors"]),"description":"Color of the Nous Girl performing this part."},
                      "name":{"type":"string"}, "voice":{"type":"string"}, "lyrics":{"type":"string"}, "melody":{"type":"string"},
                      "level":{"type":"number","minimum":0,"maximum":1}, "pan":{"type":"number","minimum":-1,"maximum":1}, "muted":{"type":"boolean"}}}},
      "keep_turn": {"type": "string", "description": "Sing: save the matched exchange from the open Voice Lab using the turn_id returned by voice_lab_jam. Optionally direct its words in the same call."},
      "take_id": {"type": "string", "description": "Sing: edit a saved take by ID or 'song' for the main song. Defaults to the active take or song."},
      "take_part": {"type": "string", "enum": ["call", "reply"], "description": "Part of a take to edit; defaults to reply."},
      "directions": {"type": "array", "description": "Sing: replace just the specified words’ directions, preserving others. Give only word/occurrence to undo its direction.",
                     "items": {"type": "object", "required": ["word"], "additionalProperties": False, "properties": {
                         "word": {"type": "string"}, "occurrence": {"type": "integer", "minimum": 1, "description": "Defaults to first."},
                         "slide": {"type": "boolean"}, "swell": {"type": "boolean"}, "vibratoAt": {"type": "number", "minimum": 0, "maximum": 1, "description": "Fraction of the vowel before vibrato starts, e.g. 0.5 for halfway, 1 for straight."}}}},
      "pattern": {"type": "string", "description": "Beat: 16 or 32 space-separated steps: kick, snare, hat, open, click, bass, hum or '.' (rest)."},
      "text": {"type": "string", "description": "Speak: the phrase (max 1000 chars), or ARPABET when phonemes=true (words separated by '/')."},
      "phonemes": {"type": "boolean", "description": "Speak: treat text as ARPABET phonemes."},
      "rate": {"type": "number", "description": "Speak: rate multiplier 0.4–2.5 (default 1)."},
      "expression": {"type": "number", "description": "Speak: intonation range 0–1."},
      "melody": {"type": "string", "description": "Sing: notes as NOTE:BEATS tokens."},
      "notes": {"type": "array", "items": {"type": "object", "properties": {"start": {"type": "number"}, "length": {"type": "number"}, "midi": {"type": "number"}, "note": {"type": "string"}}},
                "description": "Sing: explicit notes with start/length in beats and midi (36–96) or note name."},
      "lyrics": {"type": "string", "description": "Sing: lyrics, e.g. 'hel-lo my friend'."},
      "bpm": {"type": "number", "description": "Sing: tempo 30–240. Beat: 50–200."},
      "loop": {"type": "boolean", "description": "Sing: loop in the live view."},
      "style": {"type": "string", "enum": ["natural", "cartoon", "yodel"],
                "description": "Sing: 'cartoon' scoops into notes, slides, wobbles and exaggerates the mouth for funny songs; 'yodel' flips to falsetto on the high notes and back to chest voice on the low ones (write leaps of a fifth or more, e.g. yo-de-lay-ee-hoo); 'natural' (default) is plain."},
      "duet": {"type": "string", "enum": ["off", "octaveBelow", "fifthBelow", "thirdAbove", "custom"],
               "description": "Sing: a second singer on a harmony part derived from the melody (octave below, fifth below, a third above in the song's key), or 'custom' with second_melody."},
      "second_voice": {"type": "string", "description": "Sing, duet: the second singer's voice preset id (e.g. baritone, tenor, child, head, alto)."},
      "second_melody": {"type": "string", "description": "Sing, duet: a written second part as NOTE:BEATS tokens (sets duet to custom)."},
      "second_lyrics": {"type": "string", "description": "Sing, duet: lyrics for the written second part (default: the song's)."},
      "render": {"type": "boolean", "description": "Render a WAV attachment (default true)."}},
     ["mode"]),
    ("voice_lab_jam",
     "Jam with the user: sing a short answer to the phrase they just played on the Voice Lab keys. Use it whenever a message starts with "
     "'🎹 Jam'. Answer like call and response: stay in their key and tempo, one or two bars, take something from their phrase (a rhythm, an "
     "interval, the last note) and answer it, and vary it from turn to turn. `melody` is NOTE:BEATS tokens (e.g. 'E4:0.5 G4:0.5 A4:1 r:0.5 C5:2'); "
     "`lyrics` are optional, one syllable per note (hyphens split syllables), short and playful, replying to their words if they sang any. "
     "Echo the turn_id from the jam message so the player can keep the matched exchange. Then say at most one short line.",
     tool_jam,
     {"session_id": SESSION,
      "turn_id": {"type": "string", "description": "Copy the turn_id from the player’s jam message."},
      "melody": {"type": "string", "description": "The answer as NOTE:BEATS tokens, r = rest. At most 32 notes and 32 beats."},
      "lyrics": {"type": "string", "description": "Optional lyrics, one syllable per note; empty to scat on 'ah'."},
      "bpm": {"type": "number", "description": "Tempo 30–240; use the user's."}},
     ["melody"]),
    ("voice_lab_render",
     "Render this conversation's Voice Lab project (or a variation with parameter overrides that are not saved) to a WAV file attachment.",
     tool_render,
     {"session_id": SESSION,
      "mode": {"type": "string", "enum": ["play", "speak", "sing", "beat", "ensemble"], "description": "Defaults to the project's current mode."},
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
