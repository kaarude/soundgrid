# SoundGrid — Roadmap

What's left to ship, grouped by phase. Each item is a **feature/function** with a description and a goal — no implementation detail or code. Checkboxes track whether a phase is started; they are not individual tickets.

> [!IMPORTANT]
> **macOS is not working or supported yet.** The current preview repeatedly requests microphone permission even after the user chooses **Allow** or **Don't Allow**, and its UI is clipped instead of resizing with the window. Both defects must be fixed and validated on real hardware before macOS support can be marked complete.

**Current status (already done):** Electron + TypeScript + Vite shell; main process (window, tray, IPC, library/settings stores, hotkey manager); Rust native audio sidecar with CPAL/WASAPI and experimental CoreAudio device I/O, Symphonia decoding, independent mic/monitor buses, real-mic passthrough, overlap modes, and real peak metering; native device enumeration; preload bridge; the full "Cue Rack" renderer UI; persisted routing; guided VB-CABLE and experimental BlackHole setup; Windows NSIS and non-working macOS preview packaging; cross-platform release CI.

**Locked decisions driving this roadmap:**

- Audio enters the mic via a free virtual audio cable: bundled VB-CABLE on Windows and guided BlackHole setup on macOS. SoundGrid does not ship its own kernel or CoreAudio driver.
- **Windows** is the currently supported platform. macOS is an experimental target and must not be described as supported until its permission flow, responsive layout, and end-to-end audio routing pass real-hardware validation.
- **Voice changer** is a future full system: pitch/formant + effects chain + presets + per-clip voice profiles.

**One hard dependency to resolve early:** we must pick a virtual audio driver we are **legally allowed to redistribute** inside an open-source installer. VB-CABLE is donationware and its redistribution terms need explicit permission; some OSS driver projects exist but are old/maintenance-only. This is decision gate **G1** (see Cross-cutting) and it gates Phase 0.

---

## Phase 0 — Make it actually work _(critical path)_

The app is a real UI over a stubbed audio engine. Phase 0 replaces the stub with a working Windows audio pipeline so firing a clip genuinely reaches other apps as mic input.

### 0.1 Select and license a redistributable virtual audio driver ✅

- **Description:** Evaluate candidate virtual audio cables we can legally bundle (VB-CABLE redistribution license, or a truly open-source WDM/APO virtual device). Confirm licensing, signing, and install behavior on Windows 10/11.
- **Goal:** A single, redistributable virtual device we can ship inside our installer without legal risk, with a documented install/configuration flow.

### 0.2 Native Windows audio engine (WASAPI) ✅ _(hardware validation pending)_

- **Description:** Replace the stubbed `AudioEngine` with a real native audio backend on Windows. The **mic bus** renders decoded PCM to the selected "Mic output device" (the virtual cable) via WASAPI (shared or low-latency exclusive). The **monitor bus** renders independently to the selected headphone device.
- **Goal:** A clip fired via "Mic" is heard by other apps as mic input; a clip fired via "Preview" is heard only on the user's headphones. Two buses, two destinations, fully decoupled — the core product promise working for real.

### 0.3 Real microphone capture + passthrough mixing ✅ _(hardware validation pending)_

- **Description:** Capture the user's physical microphone and mix it into the mic bus so their real voice is still heard alongside clips. Honor the **Passthrough real mic** toggle and the **Real mic (passthrough)** device selection.
- **Goal:** With passthrough on, other apps hear both the user's voice and fired clips; with it off, other apps hear only clips. The mix is clean (no double-buffering artifacts, no echo).

### 0.4 Real metering ✅

- **Description:** Drive the two vertical console meters from actual audio levels (RMS/peak) of the mic bus and monitor bus, instead of the current simulated random-walk. Include a peak-hold tick.
- **Goal:** The meters reflect what is genuinely going to the mic and to the headphones — trustworthy at a glance, not decorative.

### 0.5 Native device enumeration ✅

- **Description:** Enumerate audio devices in the main process via WASAPI (playback devices, recording devices) instead of relying on the renderer's `navigator.mediaDevices`. Group them into mic-outputs (the cable), monitors (headphones), and real mics, with stable ids across sessions.
- **Goal:** The Settings routing dropdowns list real devices with correct labels, persist reliably, and survive device plug/unplug.

### 0.6 Auto-configure the bundled cable on first run ✅ _(Windows validation pending)_

- **Description:** On first launch, detect whether the bundled virtual cable is installed and set as the system; if not, install/configure it from the bundled payload, then pre-select it as the **Mic output device** and default the monitor to the user's default playback device.
- **Goal:** A first-run user reaches "other apps hear my clips" with zero manual driver setup — the smoother UX we chose.

---

## Phase 1 — Core feature completeness

The UI is present but several controls are not yet wired to real behavior. Phase 1 makes every visible affordance functional.

### 1.1 Per-clip settings ✅

- **Description:** Editable per clip: rename, favorite, hotkey binding, per-clip volume, loop toggle, and a broadcast vs monitor-only flag. Expose these inline on a clip (an "edit" affordance) and persist to the library index.
- **Goal:** Each clip is fully configurable without touching global settings; monitor-only clips can be previewed without ever reaching the mic.

### 1.2 Global hotkey system

- **Description:** Bind a system-wide hotkey per clip (fires on the mic bus), plus global **Stop all** and **mic-mute** hotkeys. Add conflict detection against OS/other-app shortcuts, a key-capture UI in per-clip settings, and an optional **hold-to-play** mode. Register/unregister on settings change.
- **Goal:** The user fires any clip from any app without focusing SoundGrid — the "eyes-off-the-app" principle made real.

### 1.3 Overlap behavior ✅

- **Description:** Implement the three overlap modes the settings already expose: **stop** (new clip cuts the current one), **overlap** (layer), and **queue** (wait). Applied per bus.
- **Goal:** Predictable multi-clip behavior that matches the selected mode, with no clicks/pops on transitions.

### 1.4 Library management

- **Description:** Drag-and-drop import into the grid; re-import/refresh; bulk select and delete/recategorize; watch the sounds folder for external additions; detect and surface missing/moved source files.
- **Goal:** Managing 5–500 clips is fast and forgiving; broken file references are shown clearly, not silently dropped.

### 1.5 Settings enforcement ✅

- **Description:** Make every settings toggle actually do what it says: **Headset-only mode** (never route monitor to speakers), **Mic-only mode** (silence local monitor while broadcasting), **Auto-select mic** (follow system default), **Theme** (light/system actually implemented, not just dark), **Run on startup** (real OS autostart registration).
- **Goal:** No placebo toggles — every control in Settings changes real behavior.

### 1.6 Tray actions ✅

- **Description:** Expand the tray menu to include Stop all, mic-mute toggle, "currently playing" readout, and Open — all reflecting live state.
- **Goal:** Core control without opening the window.

---

## Phase 2 — Polish & production readiness

Take a working app to a defensible, studio-grade product.

### 2.1 First-run onboarding wizard

- **Description:** Turn the current first-run card into a short guided flow: cable status → set Mic output → set Headphones → import first clips → fire a test clip and confirm it's heard. Progress-marked and resumable.
- **Goal:** A brand-new user reaches a successful first broadcast in under two minutes, with confidence they're routed correctly.

### 2.2 Accessibility pass

- **Description:** Full keyboard navigation audit (every clip, transport, and control reachable and operable); focus trap and restore in the settings drawer; correct ARIA roles/labels for meters, switches, and live now-playing; a real reduced-motion audit; visible focus rings verified at every interactive element.
- **Goal:** The control surface is usable by keyboard alone and legible to assistive tech, per the PRODUCT.md commitments.

### 2.3 Performance for large libraries

- **Description:** Virtualize the clip grid so 1000+ clips scroll smoothly; add a name search index for instant filtering; debounce search.
- **Goal:** No jank with large libraries; search is instant.

### 2.4 Error & edge states

- **Description:** Designed states for: device disconnect mid-playback, mic permission denied, corrupt library file, missing source files, unsupported/empty audio file, and audio engine init failure. Each with a clear message and a recovery path.
- **Goal:** Failures are legible and recoverable, never silent or crashing.

### 2.5 Audio quality niceties ✅

- **Description:** Loudness normalization on import (target peak so clips don't clip the mic bus), optional fade-in/fade-out to avoid clicks, per-clip trim, and a master limiter on the mic bus to prevent clipping when overlapping.
- **Goal:** Clips play at consistent, safe levels with no abrupt digital clicks.

### 2.6 Copy & microcopy pass

- **Description:** Audit all labels, tooltips, empty/error messages, and the first-run copy for clarity and the PRODUCT.md voice (immediate, instrumented, unpretentious).
- **Goal:** Every string reads like a calm instrument, not a developer placeholder.

---

## Phase 3 — Packaging & distribution

Produce the downloadable open-source `.exe` and the release pipeline.

### 3.1 Windows installer + portable build

- **Description:** Produce an NSIS installer and a portable `.exe` via electron-builder, bundling the chosen virtual cable payload and the app. Installer runs the cable setup (or prompts elevation) and creates Start Menu / desktop shortcuts.
- **Goal:** A single downloaded installer yields a working SoundGrid on a clean Windows 10/11 machine.

### 3.2 Code signing

- **Description:** Sign the Windows executable and installer (Azure Trusted Signing or an EV cert) so SmartScreen doesn't scare users.
- **Goal:** A clean install experience with no "unknown publisher" warnings.

### 3.3 GitHub Actions release workflow

- **Description:** A release CI that builds the Windows artifacts on a Windows runner, signs them, and publishes them to GitHub Releases on tag. Include a license-audit step for the bundled cable.
- **Goal:** Reproducible, signed releases from a tag push, with artifact verification.

### 3.4 Auto-update

- **Description:** Wire electron-updater so installed users get notified of and can pull new releases.
- **Goal:** Ongoing updates without manual re-download.

### 3.5 Docs & open-source hygiene

- **Description:** Install/setup guide, a "how mic injection works" explainer (the virtual cable concept, so users trust it), CONTRIBUTING, issue templates, and a dependency/license manifest (especially the bundled cable).
- **Goal:** A credible open-source project a stranger can install, understand, and contribute to.

---

## Phase 4 (Future) — Voice changer

A full real-time voice transformation system on top of the existing two-bus engine. This is a major future phase, not next.

### 4.1 Real-time DSP on the mic bus

- **Description:** Insert a low-latency digital signal processing chain into the mic bus (and optionally the real-mic passthrough path) so transformed audio is what other apps receive. Latency budget tight enough for live conversation.
- **Goal:** Voice transformation is broadcast to others in real time, with no perceptible delay in normal conversation.

### 4.2 Pitch + formant shifting

- **Description:** Independent pitch shift and formant shift as the foundation primitives. Pitch changes perceived frequency; formant shifts the vocal-tract character without changing pitch — the two together make natural-sounding gender/age/size changes rather than "sped-up tape" artifacts.
- **Goal:** Smooth, artifact-light pitch and formant control across a useful range.

### 4.3 Effects chain

- **Description:** A composable chain of effects after pitch/formant: **reverb** (space), **distortion/overdrive** (grit), **parametric EQ** (tone shaping), **ring modulation** (robotic/metallic), **delay/echo**, **chorus**, **noise gate**, and **compressor**. Effects are reorderable and bypassable.
- **Goal:** A flexible chain that can build everything from a subtle room to a full alien/robot character.

### 4.4 Preset system

- **Description:** Built-in named presets (e.g. Robot, Demon, Chipmunk, Deep, Radio, Megaphone, Alien, Telephone) each bundling a pitch/formant/effects configuration. Users can save, name, export, and import custom presets.
- **Goal:** One-click character voices plus sharable custom presets.

### 4.5 Per-clip voice profiles

- **Description:** Assign any preset to an individual clip, so different clips can play through different voices. Unassigned clips use the default/live voice.
- **Goal:** A single soundboard can fire a demon laugh, a robot stinger, and a normal clip without reconfiguring between them.

### 4.6 Live voice mode

- **Description:** Apply the voice changer to the real-mic passthrough stream, so the user's live speaking voice is transformed on the way to the mic bus — not just clips. Includes a bypass toggle and a "listen to yourself" monitor toggle.
- **Goal:** SoundGrid doubles as a live voice changer, not just a clip player.

### 4.7 Voice UI

- **Description:** A dedicated voice panel: preset picker, parameter sliders (pitch, formant, per-effect controls), an A/B preview (hear the processed vs dry signal on headphones without broadcasting), and per-clip profile assignment.
- **Goal:** Powerful voice configuration that stays calm and instrumented, matching the Cue Rack register rather than becoming a gimmicky "gamer RGB" effects rack.

### 4.8 Voice-changer performance & quality constraints

- **Description:** Keep the DSP chain within the latency budget on modest hardware, with a quality/degradation fallback if the chain gets too heavy, and CPU metering so the user knows when they're pushing it.
- **Goal:** Live voice stays usable under load; heavy chains degrade gracefully instead of glitching.

---

## Phase 5 — macOS port 🚧 _(reopened — not working)_

The macOS port aims to preserve the same product surface while using native CoreAudio and Apple platform conventions underneath. Its current preview is not functional enough for user testing.

### 5.1 CoreAudio engine + loopback cable 🚧 _(permission loop and BlackHole validation pending)_

- **Description:** The experimental native sidecar runs on CoreAudio and classifies macOS devices, recommends BlackHole for mic injection, and attempts to preserve the same two-bus model. The microphone permission request currently repeats forever after either user response, preventing further validation.
- **Goal:** Feature parity on macOS for the core soundboard (clips → mic).

### 5.2 Platform specifics 🚧 _(permission flow, responsive UI, and Developer ID credentials pending)_

- **Description:** Fix the repeating TCC microphone-consent flow and the window layout that clips the sidebar and content instead of resizing. Then validate global accelerators, Login Items, universal packaging, signing, and notarization on real hardware.
- **Goal:** A first-class macOS app that respects Apple's permission model and notarization requirements.

---

## Cross-cutting concerns

### C1 Latency budget

- **Description:** Define and enforce an end-to-end latency target (fire → other app hears) and a live-voice target, measured on the target hardware. Profile the engine and DSP against it.
- **Goal:** SoundGrid feels instant for clips and conversational for live voice.

### C2 Security & privacy

- **Description:** Mic access is sensitive — document exactly what's captured and where it goes (local only; no network), request permissions clearly, and never record without intent.
- **Goal:** Users can trust an app that touches their microphone.

### C3 Telemetry (opt-in or none)

- **Description:** Decide whether to include crash/usage telemetry. If yes, opt-in only, minimal, and documented; if no, state it.
- **Goal:** A clear, honest data stance consistent with an open-source project.

### C4 Testing

- **Description:** A test strategy covering the audio engine contract (device routing, overlap modes, passthrough mix), the library/settings persistence, and the UI (the Playwright harness already used for QA). Unit-test the DSP math when the voice changer lands.
- **Goal:** Refactors and the voice changer don't silently break routing or sound.

---

## Decision gates (open questions to resolve)

- **G1 — Which redistributable virtual cable do we bundle? RESOLVED:** standard VB-CABLE 4.5, distributed unchanged with the required VB-Audio donationware attribution and donation link. Written confirmation from VB-Audio is still recommended before a broad public release.
- **G2 — Minimum Windows version?** Windows 10 vs 11 only affects WASAPI features and signing paths; pick a floor.
- **G3 — Telemetry stance?** None vs opt-in (see C3).
- **G4 — Voice changer DSP approach?** When Phase 4 starts, decide whether to use an existing real-time DSP library, a Web Audio worklet pipeline, or a native Rust/C++ DSP chain on the mic bus. This is a Phase 4 decision, recorded here so it's not forgotten.

---

## Suggested sequencing

1. **Phase 0** (make it work) — resolve G1, then the WASAPI engine + passthrough + metering + auto-config. Nothing else matters until a clip actually reaches another app.
2. **Phase 1** (make every control real) — per-clip settings + hotkeys + overlap + library management.
3. **Phase 3.1–3.3** (ship a Windows build + CI) — get a downloadable, signed `.exe` out.
4. **Phase 2** (polish) — onboarding, a11y, performance, error states.
5. **Phase 4** (voice changer) — once the core is stable and shipped.
6. **Phase 5** (macOS) — reopened; fix the permission loop and responsive-layout defect, then complete end-to-end hardware, signing, and notarization validation.
