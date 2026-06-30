# Product

## Register

product

## Users

A blend of three overlapping audiences, all on a desktop, often in a dim room, with their attention somewhere *other* than the app:

- **Gamers mid-match** — low ambient light, one hand on the game, firing clips from memory via hotkeys. The app is peripheral vision: a glance, never a focus.
- **Streamers and casters** — on-stage comedic timing. They queue bits for an audience; their eyes are on the scene, not the soundboard. Reliability and instant stop-matter more than discovery.
- **Discord hangout hosts** — casual, social, playful jabs between friends. Lower stakes, higher frequency of use.

The shared job: **fire a sound clip into the microphone stream so other people hear it as if it came from your mic** — and hear it yourself on your headset, independently of what's broadcast. Success is measured in latency, never-miss hotkeys, and zero routing confusion — not in how the app "looks."

## Product Purpose

SoundGrid is an open-source, Windows-first (cross-platform later) soundboard that plays audio clips directly into the active microphone stream via a virtual audio device, so games, Discord, OBS, and any voice app receive the clips as mic input. No extra hardware. Distributed as a single `.exe`.

It exists because the only polished tools that do this are commercial; an open-source alternative should be free, auditable, and not dependent on a paid driver. The product's defining technical commitment is the **two-bus audio model**: a *mic bus* (sent to a virtual cable, heard by others) and a *monitor bus* (sent to headphones, heard only by you), each with independent play/pause/stop/mute/volume. That distinction *is* the product — it must be impossible to confuse which bus a clip is going to.

## Brand Personality

A deliberate tension between two registers, held together by restraint:

- **Punchy + playful gamer-energy** in the *firing* surface — the act of triggering a clip should feel satisfying, immediate, a little fun. Quick haptic-feeling feedback, no ceremony.
- **Calm + pro + precise like a mixer console** in the *control* surface — transport, routing, settings, and levels read as a trustworthy instrument. Nothing flashy where precision lives.

Three-word feel: **immediate, instrumented, unpretentious.**

Emotional goal: the user never feels like they're fighting the tool. Triggering a clip is fun; configuring it is calm. The app earns trust by being quietly competent, then lets loose for half a second when a sound fires.

## Anti-references

- **Cluttered freeware skin** — 2000s media-player chrome, faux-neon reflections, busy button stacks, every control visible at once. We are the opposite of this: only what the moment needs.
- **Generic Electron gray** — the flat, defaulty, undifferentiated dark that every starter Electron template ships. No identity, no craft, "Dark Mode™" as a costume. SoundGrid must look like it was *designed*, not scaffolded.

We are NOT trying to be an over-designed "gamer RGB" skin (neon rainbows, aggressive glow) nor an over-minimal dark clone (so quiet it has no personality). The sweet spot is an instrument that happens to be fun.

## Design Principles

1. **Playful where it's safe, precise where it counts.** Firing a clip is the fun moment — let it feel good. Routing, levels, and settings are the trust moment — keep them calm, labeled, and unambiguous. Never let decoration leak into the control surface.

2. **Eyes-off-the-app by default.** The user is in a game or on a stream. Every primary action has a hotkey, a tray entry, and a one-glance affordance. The window is a control panel you check, not a screen you watch. Design for peripheral vision and muscle memory.

3. **Two buses, no ambiguity.** The mic-out / headphones split is the product. Routing must be unmissable at a glance — distinct, persistent visual identity per bus so you never broadcast to the wrong place by accident. Mute and "monitor-only" states must be obvious from across the room.

4. **Earn the dark theme.** Dark because gamers and streamers sit in low light and blasting a white panel wrecks the room — not because "tools look cool dark." Contrast stays real (no ghost-gray-on-graphite). Accents carry the brand; the background stays out of the way.

5. **Open-source citizen, not a skin.** The interface reflects a free, auditable tool: honest labels, no faux-premium chrome, no decorative gradients hiding thin functionality. Craft shows through precision, not through ornament.

## Accessibility & Inclusion

No formal WCAG target was requested — the bar is "keep it genuinely usable." Even so, because this is a control surface used fast and often peripherally, a few cheap defaults are worth committing to:

- Real contrast on all interactive labels (no ghost-gray-on-graphite) — usable in a dim room.
- Full keyboard navigation; every clip and transport reachable without the mouse.
- `prefers-reduced-motion` respected for any feedback animations (the clip-fire micro-interaction is short and non-essential).
- Mute / routing states conveyed by shape and position, not color alone, since the whole app turns on "which bus am I sending to."

No specialized accommodations claimed beyond these sensible defaults.