# Hermes Voice Lab (plugin)

This folder is the installable Hermes plugin. It holds only what runs: the agent tools and read-aloud provider (`__init__.py`, `voice_backend.py`, `tts.py`), the desktop REST routes (`dashboard/`), the Desktop bundle (`desktop/plugin.js`), and the Node renderer with its WebAssembly engine (`runtime/`). It is built from the repository's sources by `npm run build`; do not edit `desktop/plugin.js` or `runtime/` by hand.

Install:

```bash
hermes plugins install Adolanium/hermes-voice-lab/plugin --enable
```

Then restart the gateway, and in Hermes Desktop enable **Voice Lab** under **Capabilities → Plugins**.

Full documentation, the source code and the demo are in the repository's top-level README.
