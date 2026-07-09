# Changelog

## 0.2.0 — macOS support

> [!IMPORTANT]
> **The macOS version is not working yet.** The `v0.2.0-beta.3` preview has two confirmed blockers: its microphone permission prompt repeats forever after either response, and its UI is clipped instead of resizing with the window. The items below describe implementation work, not production-ready macOS support.

- Added the native CoreAudio backend with the same independent mic and monitor buses used on Windows.
- Added guided BlackHole setup, loopback-device detection, and safe macOS routing defaults.
- Added microphone permission handling for physical-mic passthrough and native Login Item startup support.
- Added universal Apple Silicon and Intel DMG/ZIP builds, hardened-runtime entitlements, notarization configuration, and macOS auto-update metadata.
- Added macOS release CI and refreshed setup, privacy, troubleshooting, and contributor documentation.

The permission loop, responsive-layout defect, BlackHole loopback hardware validation, and Apple Developer ID signing all remain release gates for a stable macOS build. Until those gates are cleared, macOS artifacts are unsupported development previews; stable tags fail closed.
