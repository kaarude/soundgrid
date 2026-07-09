# Changelog

## 0.2.0 — macOS support

- Added the native CoreAudio backend with the same independent mic and monitor buses used on Windows.
- Added guided BlackHole setup, loopback-device detection, and safe macOS routing defaults.
- Added microphone permission handling for physical-mic passthrough and native Login Item startup support.
- Added universal Apple Silicon and Intel DMG/ZIP builds, hardened-runtime entitlements, notarization configuration, and macOS auto-update metadata.
- Added macOS release CI and refreshed setup, privacy, troubleshooting, and contributor documentation.

BlackHole loopback hardware validation and Apple Developer ID signing remain release gates for a stable macOS build. Until signing credentials are configured, v0.2.0 macOS artifacts are published as prerelease builds.
