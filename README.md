# MeetNote
meeting recorder, transcription, and meeting intelligence platform

## Phase 1 — Google Meet recorder (Chrome extension MVP)

Records the audio of a Google Meet tab locally and saves it as a WebM file. No backend,
no accounts, no transcription yet.

### Load it

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the `extension/` folder.
3. Open a Google Meet call, click the MeetNote toolbar icon, then press **Record**.

Requires Chrome 116 or newer (the extension uses `chrome.runtime.getContexts`).

### Validate

```bash
npm run check
```

Validates `manifest.json`, the files it references, the asset references in each HTML page,
and parses every extension script.

### Known limitation

Chrome's `tabCapture` records **what the tab plays** — the other participants. Your own
microphone is not part of the tab's output, so it is not in the recording. Capturing your
own voice needs a separate microphone stream, which is out of scope for Phase 1.
