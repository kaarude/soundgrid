# SoundGrid

> An open-source, cross-platform **soundboard** that plays your audio clips directly into your microphone stream — so games, Discord, OBS, and any voice app hear your sounds as if they came from your mic. No extra hardware.

Windows-first. Distributed as a single `.exe` (NSIS installer + portable build). MIT-licensed and free forever.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-WIP%20/%20pre--alpha-orange)](#roadmap)
[![Made with Electron](https://img.shields.io/badge/Electron-33-47848f.svg)](https://www.electronjs.org/)

---

## Why

The only polished tools that do this are commercial, paid, and depend on a
closed (often paid) kernel driver. SoundGrid is free, auditable, and relies on a
free virtual audio cable instead. Its defining technical commitment is the
**two-bus audio model** — the split between "what others hear" and "what you
hear" is the whole product, and the UI makes it impossible to confuse the two.

## The hard part, up front

Windows and macOS have **no built-in "play audio into the microphone" API**.
Soundboard-class apps inject audio via a **virtual audio device**. Commercial
apps like Soundpad ship their own signed kernel driver; an open-source project
realistically relies on a free virtual cable such as **[VB-CABLE](https://vb-audio.com/Cable/)**.

SoundGrid routes its *mic bus* to whichever device you select as your
"Mic output device" — point that at a virtual cable, then set the cable as your
microphone in Discord / OBS / your game, and other people hear your clips. See
[`PLAN.html`](PLAN.html) for the full design.

## Two-bus audio model

```
Sound clip
   │
   ├──► [Mic bus]      ──► volume ──► Virtual Audio Cable  ──► apps hear it as mic
   │                                  (+ your real mic mixed in if passthrough ON)
   │
   └──► [Monitor bus]  ──► volume ──► Headset / headphones  ──► only YOU hear it
```

- The mic bus has its own **play / pause / stop / mute / volume** — fully
  independent of what you hear.
- The monitor bus is **headphones only**. With _headset-only mode_ on, it never
  leaks to speakers.
- With _mic-only mode_ on, a clip is sent to the mic and you hear nothing locally.

## Features

- **Two independent buses** — mic out and monitor (headphones), each with its own
  transport and volume.
- **Global hotkeys** — fire any clip from memory while in-game; never tab out.
- **Tray + per-clip controls** — the window is a control panel you check, not a
  screen you watch. Designed for peripheral vision and muscle memory.
- **Mute / monitor-only / mic-only routing states** — unmissable at a glance, by
  shape and position, not color alone.
- **Local library** — import your own clips; SoundGrid stores them in the app
  data directory.
- **Single `.exe`** — NSIS installer + portable build via `electron-builder`.

### Supported audio formats

Import: **MP3, WAV, OGG/OGA, FLAC, M4A/AAC, OPUS, WebM-audio**.

## Tech stack

- **Electron 33** — cross-platform desktop shell
- **TypeScript** — end-to-end, strict
- **Vite 6** — renderer dev server + build
- **electron-builder** — Windows NSIS + portable packaging
- **plain DOM** renderer — no framework, on purpose (small, fast, auditable)

## Project layout

```
soundgrid/
├── src/
│   ├── main/         # Electron main process
│   │   ├── main.ts             # window, tray, IPC, lifecycle
│   │   ├── audio-engine.ts     # the two-bus mic / monitor engine
│   │   ├── library.ts          # sound storage + library.json index
│   │   ├── settings.ts         # persisted settings
│   │   ├── devices.ts          # audio device enumeration
│   │   └── hotkeys.ts          # global OS shortcuts
│   ├── preload/      # context-isolated bridge (window.soundgrid)
│   ├── renderer/     # UI (plain DOM + Vite)
│   │   ├── components/App.ts
│   │   ├── styles/app.css
│   │   └── main.ts
│   └── shared/       # types + IPC channels shared across all processes
├── PRODUCT.md        # product intent and user model
├── DESIGN.md         # current design system
├── PLAN.html         # the original design plan
├── electron-builder.json
└── vite.config.ts
```

## Getting started (development)

```bash
npm install
npm run dev
```

This launches Vite on `:5173` and starts Electron pointed at it. On first run,
open **Settings** and pick your virtual audio cable as the _Mic output device_.

Useful scripts:

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `npm run dev`      | Vite + Electron, hot-reloading renderer        |
| `npm run build`    | Build renderer + main into `dist/`             |
| `npm run pack`     | Build + unpacked app (sanity check)            |
| `npm run dist`     | Build + Windows NSIS installer + portable exe  |
| `npm run dist:mac` | Build + macOS package (dev-only; no mic inject)|
| `npm run check`    | Type-check main + renderer                      |
| `npm run format`   | Prettier write across the repo                 |

## Building a Windows `.exe`

Windows installers must be built on Windows (or CI). From a Windows machine:

```bash
npm install
npm run dist     # produces NSIS installer + portable exe in release/
```

For cross-platform builds from any OS via GitHub Actions, see
`.github/workflows/release.yml` (planned).

> macOS note: macOS has no API to inject audio into a real mic, so on Mac the
> mic bus falls back to a normal output device — enough to develop and test the
> UI/transport. The Windows production build uses a native WASAPI helper
> (planned) to render the mic bus straight to the chosen virtual device.

## Roadmap

- [ ] Native WASAPI mic-bus routing on Windows
- [ ] Real-mic passthrough / mixing into the mic bus
- [ ] Per-clip hotkey binding UI
- [ ] Library import + drag-and-drop
- [ ] Persisted device selection
- [ ] GitHub Actions release pipeline (NSIS + portable)

## License

[MIT](LICENSE) — open source, free forever. Contributions welcome.

## Contributing

This is early and pre-alpha. The design language and two-bus model are the load-
bearing decisions; please read [`PRODUCT.md`](PRODUCT.md), [`DESIGN.md`](DESIGN.md),
and [`PLAN.html`](PLAN.html) before large changes. PRs that keep the control
surface calm and the firing surface fun are very welcome.
