"""Optional read-aloud provider: set ``tts.provider: voice-lab`` to hear Hermes'
replies in the Voice Lab character voice. Synthesis is the same local
articulatory engine; English (and a first Korean), and less natural than neural TTS.
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, Iterator, Optional

from agent.tts_provider import TTSProvider

from . import voice_backend as vb


class VoiceLabTTS(TTSProvider):
    streams_pcm = True
    stream_sample_rate = 24000

    @property
    def name(self) -> str:
        return "voice-lab"

    @property
    def display_name(self) -> str:
        return "Hermes Voice Lab (local articulatory)"

    def is_available(self) -> bool:
        return vb.node_binary() is not None

    def list_voices(self) -> list[dict[str, Any]]:
        return [{"id": p["id"], "display": f"{p['name']} — {p['description']}", "language": "en", "gender": "female"}
                for p in vb.catalog()["voicePresets"]]

    def list_models(self) -> list[dict[str, Any]]:
        return [{"id": "articulatory-v2", "display": "Articulatory tube model", "languages": ["en"], "max_text_length": 1000}]

    def _voice(self, voice: Optional[str]) -> str:
        ids = {p["id"] for p in vb.catalog()["voicePresets"]}
        return voice if voice in ids else "signature"

    def synthesize(self, text: str, output_path: str, *, voice: Optional[str] = None, model: Optional[str] = None,
                   speed: Optional[float] = None, format: str = "wav", **extra: Any) -> str:
        path = Path(output_path)
        if path.suffix.lower() != ".wav":
            path = path.with_suffix(".wav")  # Closest supported format.
        vb.render_text(text[:1000], path, voice=self._voice(voice), speed=speed)
        return str(path)

    def stream(self, text: str, *, voice: Optional[str] = None, model: Optional[str] = None, format: str = "pcm",
               **extra: Any) -> Iterator[bytes]:
        if format != "pcm":
            raise NotImplementedError("Voice Lab streams raw PCM only")
        with tempfile.TemporaryDirectory(prefix="voice-lab-tts-") as tmp:
            out = Path(tmp) / "speech.wav"
            node = vb.node_binary()
            if not node:
                raise RuntimeError("Node.js is required for Voice Lab speech")
            import subprocess
            argv = [node, str(vb.RUNTIME / "render.mjs"), "--text", text[:1000], "--output", str(out), "--voice", self._voice(voice),
                    "--channels", "1", "--rate", str(self.stream_sample_rate)]
            speed = extra.get("speed")
            if speed:
                argv += ["--speed", str(max(0.4, min(2.5, float(speed))))]
            run = subprocess.run(argv, capture_output=True, text=True, timeout=vb.RENDER_TIMEOUT, check=False)
            if run.returncode or not out.is_file():
                raise RuntimeError(f"Voice Lab speech failed: {run.stderr.strip()[-500:]}")
            data = out.read_bytes()[44:]
        for i in range(0, len(data), 9600):
            yield data[i:i + 9600]
