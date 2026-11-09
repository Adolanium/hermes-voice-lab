# SPEC — Voice Lab instrument film

GOAL:    a Hermes Agent user sees, in one sitting, everything Voice Lab does inside the desktop app (the agent writing a song and a beat for it, then playing her by hand), then the physics up close.
OUTPUT:  HyperFrames, 1920 × 1080, 30 fps, 93.05 s.
LOOK:    the first film's language: flood ground #2152f4 with white type; the whole Hermes window as a white card (scale 0.86 at x 140, y 34, radius 20, soft shadow), never cropped;
         app zoom 100 % (Voice Lab fits the 1470 × 833 pt window); Collapse Bold for the title and end card; Inter 700 42 px captions in the band under the window, key words #ffe27a;
         the act's own warm stage. No grain, no vignette.
MOTION:  no camera moves on the app: the window stays whole; jump cuts inside it. Per-word captions rise 14 px with blur 6 px → 0, 0.22 s, 0.06 s apart; exits 0.18 s blur-out.
         Iris floods open from her mouth (act at 1378, 590); the dive goes through her lips (908, 415 in the window).
SHOTS (film seconds; app-local a = film − 4.75):
  0.00–2.60   cold open: "my lips go boop boop boop!", each boop a puff and a ring; blue iris from her mouth at 2.15.
  2.60–5.60   title: "SHE LIVES INSIDE" / "HERMES AGENT"; the wordmark lands on the app's own (x 571–1635, y 405–535) as the window fades in under it.
  4.75–13.75  ask: a new session, the request typed and sent, the reply and its Voice Lab card. Captions: the request; "It writes the song and loads it into Voice Lab."
  13.75–22.05 she sings the agent's song in Voice Lab with the band (downbeat 14.25). "She sings it live: a simulated throat, tongue and lips."
  22.05–28.95 the same chat: "Now drop a beatbox groove!"; the reply and its card. "It writes the beat too."
  28.95–35.35 the beat plays; the panel scrolls to the agent's step pattern. "Every drum is a mouth gesture."
  35.35–60.60 the instrument by hand: grab the tongue; the vowel pad ee → ah → oo; a tune on the computer keyboard; Hum, Roll, Seal lips over a held key; the Body slider child → adult under the note. One caption each.
  60.60–66.40 the pads, tapped. "Pads fire the instant you touch them." Dive through her lips at 65.60–66.40.
  66.20–87.05 the act (scat, verse, "No samples. No auto tune. Just physics!", beatbox), rendered frame-accurately from the engine with the cutaway open.
  87.05–93.05 end card: blue iris from her mouth, the eye mark draws, VOICE LAB wipes in, the plugin line, the disclosure line.
SOUND:   the app takes' own audio (tapped from the plugin's output in the app), each segment matched to the act's loudness (beat segments by their hits);
         the band vamps under the title and the first request and lands on her first downbeat, plays the verse under her; a held chord under the second request;
         nothing under the instrument and pads; a cymbal swell into the dive; the act with its own band; the final chord.
HONESTY: agent replies come from a scripted stand-in model on a local server; the tool calls, the plugin and every sound are real. The end card says so.
BANNED:  any crop or push-in on the app window (except the dive); captions over the app; corner labels/HUD; glow/particles added in the edit; event names.
QA:      1.9 (boop), 5.3 / 5.75 (match), 7.8 (typing), 12.0 (reply), 16.5 (singing), 25.2 (second request), 33.5 (pattern), 37.5 (grab), 43 (pad), 47.5 (keys), 51 (hum), 57.5 (body), 63 (pads), 66.3 (dive), 70 / 80.5 (act), 90.5 (end card).
