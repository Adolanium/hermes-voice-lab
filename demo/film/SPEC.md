# SPEC — Hermes Voice Lab demo

GOAL:    a Hermes user wants to ask their agent for a song, and believes the voice is physics, not samples.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps.
TIME:    85.81 s (34.55 s of app + title, the 41.11 s act, 5 s end card). Band at 132 bpm in the app scenes (13.64 frames a beat); the act's own tempi (150/132).
LOOK:    flood ground #2152f4 (Hermes blue, sampled from the app's wordmark) with white type; the app is a white window on it;
         the act's own warm stage (#f1efe9 → #e9e8f4 radial, unchanged). Ink #16151a.
         Display: Collapse Bold (the app's wordmark face), caps, 104 px for the setup line, 170.6 px for HERMES AGENT (matched to the app's wordmark in the window, x 462–1646, y 401–546);
         body: Inter 700 42 px white captions (key words #ffe27a) in the band under the window, Inter 700 46 px for the end-card line.
         Medium: the whole Hermes window, never cropped: recorded at the window's real size (1470 × 833 pt) with the app's own zoom at 67 % so all of Voice Lab fits,
         shown as one card at 0.86 (x 140, y 34, radius 20, soft shadow). Her black-ink illustration. No grain, no vignette.
OBJECTS: Hermes Agent's start screen and wordmark; the chat with its Voice Lab audio card; the Voice Lab instrument (portrait, cutaway, piano roll, scopes, keyboard); the Voice Lab eye mark.
MOTION:  no camera moves on the app: the window stays whole. Window fade-in 0.4 s; zoom-through power3.in 0.8 s with blur 0→14 px; per-word captions rise 14 px with blur 6 px→0, 0.22 s, 0.06 s apart; exits 0.18 s blur-out.
SHOTS:
  0.00–3.20  cold open: the act from the scat's drum pickup to "BAH!" (stab at 2.60); blue iris opens from her mouth at 2.75–3.20.
  3.20–6.20  title on blue: "SHE SINGS INSIDE" / "HERMES AGENT" per word; at 5.45 the window fades in under the wordmark, which turns blue on its white; 6.00–6.20 match dissolve.
  5.35–17.25 ask (whole window): the request is typed and sent; the agent's reply and audio card land; click Voice Lab. Captions: the request; "It writes a song and hands it to Voice Lab."
  17.25–27.20 Voice Lab: Sing; she sings with the band (downbeat 19.57). Caption "Sung live by a simulated throat, tongue and lips."
  27.20–39.10 physics: vowel; seal (3× through the drag) — the band stops dead at 31.97, caption "Seal the tongue: silence."; velum (4.8×) — hum at 36.17, caption "Open the nose: a hum."
  39.10–39.90 dive through her mouth into the act (cymbal swell).
  39.70–80.81 the act, as rendered.
  80.81–85.81 end card: blue iris from her mouth; the eye mark draws, VOICE LAB wipes in, the plugin line; final chord.
BANNED:  any crop or push-in on the app window; dark void; glow/particles; purple gradients, glass; cream paper + serif + mono labels + pills; captions over the app; corner labels/HUD; three cards; title over a dimmed screenshot; docked logo.
QA:      2.6 (stab), 4.6, 5.9 and 6.4 (match), 8.6 (request), 13.6 (reply), 19.6 (singing), 32.4 (seal caption), 37.2 (hum caption), 39.75 (dive), 40.2 (act), 84.5 (end card).
