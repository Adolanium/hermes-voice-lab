# REVIEW — Hermes Voice Lab demo

Checked with `hyperframes check` (passed: 14/14 contrast, 0 craft, 0 audio findings) and snapshots at
1.0, 2.6, 2.95, 4.6, 5.2, 5.5, 5.9, 6.4, 8.6, 11.0, 13.6, 16.6, 19.6, 23.0, 28.0, 30.5, 32.4, 34.6, 37.2, 39.4, 39.75, 40.2, 45, 60, 75, 80.5, 81.3, 82.4, 84.5, 85.56 s.

## Fixed in review
- The app was pushed in up to 2.6×, which hid most of the window. Now the whole window shows at all times:
  re-recorded at its real size with the app's own zoom at 67 % (all of Voice Lab, panels and keyboard included, fits without scrolling),
  shown as one card at 0.86 with captions in the band below it. No camera moves on the app.
- The recording no longer forces a 1920 × 1080 page inside the smaller window, so what the live window shows is what was captured.
- Title wordmark re-matched to the app's wordmark in the card: both measure x 462–1646, y 401–546.
- Setup line centred over the wordmark, not the frame.
- Soundtrack rebuilt from the new takes: in-app downbeat 19.57, seal 31.97, hum 36.17; act from 39.70.

## Watch
- In-app text is small at this scale (the cost of showing everything); the captions carry the story.
- The physics stretches are sped up 3× and 4.8× (pitch kept in the audio).
- The agent turn uses a scripted stand-in model on a local mock server; its name is visible in the composer.
