# SoundGrid

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-WIP%20/%20pre--alpha-orange)](#roadmap)
[![Made with Electron](https://img.shields.io/badge/Electron-43-47848f.svg)](https://www.electronjs.org/)

An open-source, cross-platform **soundboard** that routes audio clips directly into a virtual microphone stream — so games, Discord, OBS, and other voice applications receive the audio as if it originated from a physical microphone. No additional hardware is required.

SoundGrid supports Windows and macOS with the same Cue Rack UI and feature set. It is released under the MIT license.

**[Download SoundGrid for Windows or macOS](https://github.com/kaarude/soundgrid/releases/latest)**

---

## Overview

Existing tools in this category are typically commercial, require payment, and depend on a closed (often paid) kernel driver. SoundGrid is free, auditable, and relies on a free virtual audio cable instead.

Windows and macOS do not provide a native "play audio into the microphone" API, so soundboard-class applications inject audio through a **virtual audio device**. SoundGrid routes its _mic bus_ to the device selected as the "Mic output device." Use **[VB-CABLE](https://vb-audio.com/Cable/)** on Windows or **[BlackHole 2ch](https://existential.audio/blackhole/)** on macOS, then select the corresponding virtual input as the microphone in Discord, OBS, or a game.

The core architectural principle is the **two-bus audio model** — a clear separation between "what others hear" and "what you hear" that is enforced throughout the interface to prevent misconfiguration. The complete design is documented in [`PLAN.html`](PLAN.html).

## Two-bus audio model

```
Sound clip
   │
   ├──► [Mic bus]      ──► volume ──► Virtual Audio Cable  ──► received as microphone input
   │                                  (+ real mic mixed in when passthrough is enabled)
   │
   └──► [Monitor bus]  ──► volume ──► Headset / headphones  ──► local monitoring only
```

- The mic bus has independent **play / pause / stop / mute / volume** controls, fully decoupled from local monitoring.
- The monitor bus is **headphones only**. With _headset-only mode_ enabled, audio never leaks to speakers.
- With _mic-only mode_ enabled, a clip is sent to the mic bus with no local monitoring.

## Features

- **Two independent buses** — mic output and monitor (headphones), each with its own transport and volume.
- **Global hotkeys** — trigger any clip from memory while in-game, without switching windows.
- **Tray and per-clip controls** — the window functions as a control panel rather than a primary view, designed for peripheral vision and muscle memory.
- **Mute / monitor-only / mic-only routing states** — distinguishable at a glance by shape and position, not color alone.
- **Local library** — import custom clips; SoundGrid stores them in the application data directory.
- **Audio-safe playback** — peak-normalized clips, click-safe fades, per-clip start/end trim, and soft limiting when cues overlap.
- **Native desktop packages** — NSIS on Windows and a universal Intel/Apple Silicon DMG on macOS.

### Supported audio formats

Import: **MP3, WAV, OGG/OGA, FLAC, M4A/AAC, OPUS, WebM-audio**.

## Tech stack

- **Electron 43** — desktop shell
- **Rust + CPAL** — native WASAPI/CoreAudio device I/O, mixing, passthrough, and metering
- **Symphonia** — native clip decoding
- **TypeScript** — end-to-end, strict mode
- **Vite 6** — renderer dev server and build
- **electron-builder** — Windows NSIS plus universal macOS DMG/ZIP packaging
- **Plain DOM renderer** — intentionally framework-free for a small, fast, auditable codebase

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

## Development

```bash
npm install
npm run dev
```

This starts Vite on `:5173` and launches Electron against it. On first run, follow the in-app setup guide, which verifies the cable, routing, and first import.

### Scripts

| Command                  | Description                                |
| ------------------------ | ------------------------------------------ |
| `npm run dev`            | Vite + Electron, hot-reloading renderer    |
| `npm run build`          | Build renderer + main into `dist/`         |
| `npm run pack`           | Build + unpacked app (sanity check)        |
| `npm run dist`           | Build + Windows installer and portable exe |
| `npm run dist:installer` | Build only `SoundGrid-Setup-*.exe`         |
| `npm run dist:portable`  | Build only the no-install portable exe     |
| `npm run dist:mac`       | Build universal macOS DMG + updater ZIP    |
| `npm run check`          | Type-check main + renderer                 |
| `npm run format`         | Prettier write across the repo             |

## Building a Windows release

Windows installers must be built on Windows (or via CI). From a Windows machine:

```bash
npm install
npm run dist     # produces NSIS installer + portable exe in release/
```

The distribution build downloads the original VB-CABLE 4.5 package from VB-Audio and verifies its pinned SHA-256 before bundling it unchanged. The SoundGrid installer invokes VB-CABLE's supported silent-install mode; Windows still presents its required driver-consent prompt, followed by a restart. Settings retains a repair/retry action. VB-CABLE is separate donationware and is not covered by SoundGrid's MIT license.

The GitHub Actions release workflow also builds the installer on a clean Windows machine. Run **Build Windows installer** from the repository's Actions tab to obtain a downloadable artifact, or push a tag such as `v0.1.0` to attach the executable directly to a GitHub Release.

## Building a macOS release

macOS packages must be built on macOS with Rust's Intel and Apple Silicon targets installed:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
pnpm install --frozen-lockfile
pnpm dist:mac
```

The result is a universal DMG plus the ZIP metadata required by automatic updates. SoundGrid detects BlackHole, Soundflower, and Loopback-compatible outputs, and guides new users to the open-source BlackHole 2ch installer. BlackHole is installed separately and is not covered by SoundGrid's MIT license.

For public distribution, configure `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, and `APPLE_TEAM_ID` as GitHub Actions secrets. `APPLE_API_KEY_BASE64` is the base64-encoded `.p8` key; CI materializes it only for the build. The release workflow then signs with Developer ID, applies the hardened-runtime audio-input entitlement, notarizes with Apple, staples the result, and verifies all three operations. Stable tags fail closed when any credential is absent. Hyphenated tags such as `v0.2.0-beta.1` intentionally publish unsigned prerelease artifacts instead.

## Roadmap

- [x] Native WASAPI mic/monitor routing on Windows
- [x] Real-mic passthrough / mixing into the mic bus
- [x] Per-clip and global hotkey binding UI
- [x] Library import + drag-and-drop
- [x] Persisted device selection
- [x] GitHub Actions release pipeline (NSIS installer)
- [x] Guided first-run routing setup
- [x] Automatic update download and install
- [x] Native CoreAudio mic/monitor routing on macOS
- [x] Guided BlackHole setup and safe loopback auto-selection
- [x] Universal Intel/Apple Silicon DMG and updater ZIP pipeline

BlackHole loopback hardware validation, Apple Developer ID credentials, and explicit public-redistribution confirmation from VB-Audio remain release gates. See [`ROADMAP.md`](ROADMAP.md).

## Development methodology

This project was developed with the assistance of AI coding tools. All code, design decisions, and documentation were produced through human-directed AI collaboration and reviewed by the project maintainer. The codebase is open for inspection and contribution under the terms of the MIT license.

## License

[MIT](LICENSE) — open source, free forever. Contributions welcome.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before submitting changes. Security, privacy, and troubleshooting guidance are available in [`SECURITY.md`](SECURITY.md), [`PRIVACY.md`](PRIVACY.md), and [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md).
