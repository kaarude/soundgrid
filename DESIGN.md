---
name: SoundGrid
description: An open-source soundboard that fires clips into your mic stream — immediate, instrumented, unpretentious.
colors:
  console-black: "#0d1117"
  booth-surface: "#161b22"
  card-surface: "#1c2230"
  hairline: "#2a3140"
  ink: "#e6edf3"
  ink-dim: "#9aa4b2"
  signal-violet: "#6a45e6"
  monitor-teal: "#4fd1c5"
  alarm: "#ff6b6b"
  on-signal: "#ffffff"
  danger-solid: "#b91c1c"
  danger-solid-hover: "#d12323"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.5px"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "1px"
rounded:
  pill: "999px"
  card: "12px"
  md: "8px"
  select: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px"
  button-primary-hover:
    backgroundColor: "{colors.monitor-teal}"
  button-ghost:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  button-ghost-hover:
    textColor: "{colors.signal-violet}"
  button-ghost-danger-hover:
    textColor: "{colors.alarm}"
  chip-bus:
    backgroundColor: "{colors.booth-surface}"
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px"
  card-hover:
    backgroundColor: "{colors.card-surface}"
  input-search:
    backgroundColor: "{colors.console-black}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.md}"
    padding: "7px 10px"
  nav-item-active:
    backgroundColor: "{colors.signal-violet}"
    textColor: "#ffffff"
---

# Design System: SoundGrid

## 1. Overview

**Creative North Star: "The Cue Rack"**

SoundGrid is a rack of triggers and levels — a broadcast cue rack you glance at, never watch. It borrows two minds at once: the **firing surface** (the clip grid, the transport buttons, the fire-mic action) carries punchy, gamer-energy immediacy — satisfying to hit, fast to read in peripheral vision. The **control surface** (the two buses, the routing, the levels, settings) reads as a calm, pro mixer console — labeled, unambiguous, instrument-precise. The two never bleed: decoration stays out of the control surface; precision stays out of the fun.

The system is dark because gamers and streamers sit in low light, not because "tools look cool dark." Console Black (#0d1117) recedes; the brand lives in two signal colors — Signal Violet for the mic/broadcast side and Monitor Teal for the headphone/monitor side — and that hue split _is_ the two-bus model made visible. Depth comes from tonal layering (Console Black → Booth Surface → Card Surface) with a single soft ambient shadow reserved for genuinely elevated moments. Borders are 1px hairlines, not chrome.

This system explicitly rejects two things, both named in PRODUCT.md: the **cluttered freeware skin** (2000s media-player chrome, faux-neon reflections, every control visible at once) and the **generic Electron gray** (the flat, defaulty, undifferentiated dark every starter template ships). SoundGrid should look like it was designed for a cue rack, not scaffolded from a template.

**Key Characteristics:**

- Dark, low-light-native palette built on tonal neutrals, not neutrals-as-costume.
- Two signal colors carry meaning: violet = mic/broadcast, teal = headphones/monitor. Never decorative.
- One sans family, a tight type scale (11 / 13 / 18px), fixed-rem not fluid — a control panel, not a landing page.
- Depth = tonal layering + hairline borders; a single ambient shadow appears only on elevated state.
- Immediate feedback on the firing surface; calm, labeled precision on the control surface.

## 2. Colors: The Console Palette

A dark, low-light-native palette: three tonal neutrals carry depth, two saturated signal colors carry meaning, one alarm color carries failure. Neutrals are cool-leaning graphite, not the warm cream AI default — warmth belongs to the signal colors and motion, not the body.

### Primary

- **Signal Violet** (#6a45e6): the mic/broadcast voice. Primary actions that send audio to the mic, the active nav state, and the brand's "broadcast" identity. Used sparingly — it is the rare, meaningful accent, never decoration.
- **Monitor Teal** (#4fd1c5): the headphone/monitor voice. Used for the monitor bus, the brand logo, and the primary CTA gradient's far end. It is the calm counterpoint to violet — if violet is "going out," teal is "what you hear."

### Tertiary

- **Alarm** (#ff6b6b): failure and destructive intent only — delete, stop-all, mic-mute on hover. Never used as a generic accent. It appears, so the user looks.

### Neutral

- **Console Black** (#0d1117): the body background. The room goes dark so the rack can glow.
- **Booth Surface** (#161b22): panels — sidebar, settings, the transport buses. One step up from the body.
- **Card Surface** (#1c2230): clip cards and ghost buttons. The lightest neutral, where the eye lands.
- **Hairline** (#2a3140): all 1px borders and dividers. The structural line of the whole interface.
- **Ink** (#e6edf3): primary text. Real contrast against graphite, not ghost-gray-on-graphite.
- **Ink-dim** (#9aa4b2): secondary text, labels, placeholders. Dim but still legible in a dim room.

### Named Rules

**The Two-Voice Rule.** Exactly two signal colors exist, and each is bound to one bus: Signal Violet = mic/broadcast, Monitor Teal = headphones/monitor. Never swap them, never use both on the same control, and never introduce a third signal color. The hue split is the product's core routing distinction made visible — breaking it breaks the mental model.

**The Rare-Accent Rule.** Signal Violet touches ≤10% of any screen. It marks the active state and the broadcast action; its rarity is what makes "this is going to the mic" unmissable. If violet starts filling surfaces, it has stopped meaning anything.

**Signal surface tokens.** `on-signal` is the only text/icon color on saturated bus and danger surfaces. `mic-bus-*`, `mic-active-border`, and `monitor-bus-*` alpha tokens preserve routing identity in the top bar and active category rail; `danger-solid`, `danger-solid-hover`, `danger-fill`, and `danger-border` preserve Stop All and destructive-state contrast.

## 3. Typography

**Display Font:** none — product UI, one family carries everything.
**Body Font:** the platform sans stack — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
**Label Font:** same family, set small, uppercase, tracked.

**Character:** A single, well-tuned system sans. No display pairing, no display fonts in UI labels — this is a control surface, and a control surface earns trust by disappearing into the task. The hierarchy comes from weight, size, and case, not from a change of family.

### Hierarchy

- **Headline** (700, 18px, 1.2, +0.5px tracking): the app brand and the few top-level titles. Rare on screen; the rack does not shout.
- **Body** (400, 13px, 1.45): default UI text — button labels, card names, settings values, prose. Dense by design; users read at consistent DPI.
- **Label** (600, 11px, 1, +1px tracking, UPPERCASE): structural metadata — bus labels, card categories, settings section headers. The tracked-uppercase label is the one typographic flourish, and it is reserved for _naming_ things (buses, categories), not for decoration.

### Named Rules

**The Label-Means-Structure Rule.** Tracked-uppercase 11px labels name a bus, a category, or a settings group — nothing else. If you reach for an uppercase tracked label to add "design," you are using it as decoration. Use it only when it is genuinely naming something the user must identify at a glance.

## 4. Elevation

Depth is **hybrid**: a tonal base does the structural work — Console Black → Booth Surface → Card Surface is the elevation ramp — and 1px Hairline borders define every edge. A single soft ambient shadow appears _only_ on genuinely elevated surfaces (a popover, a modal, a focused/floating element), never as default card decoration. At rest, the interface is flat and crisp.

### Shadow Vocabulary

- **Ambient Lift** (`box-shadow: 0 8px 24px rgba(0,0,0,0.45)`): the one shadow, used only for floating/elevated surfaces (dialogs, menus, the rare popover). Cards and panels do not get it.
- **Hairline** (`border: 1px solid #2a3140`): the default structural separator. This is how panels and cards declare their edges, not with shadows.

### Named Rules

**The Flat-At-Rest Rule.** Cards, panels, buses, and buttons are flat at rest — tonal layering + 1px hairlines carry all the depth. Shadows are a response to genuine elevation (floating, focus), never a default. If a card has a drop shadow, it has been misused.

## 5. Components

Tactile and confident — satisfying to hit, solid at rest. Every interactive component has default, hover, focus, active, and (where relevant) disabled states; half a vocabulary is not a system.

### Buttons

- **Shape:** 8px corners (`--rounded-md`) for standard buttons; full pill (`999px`) only for the transport buses.
- **Primary** (the import/CTA): a Signal Violet → Monitor Teal gradient, white text, 10px padding, 600 weight. It is the single saturated moment on screen — used once per view.
- **Ghost** (transport, card actions): Card Surface fill, Ink text, 1px Hairline border, 4px 10px padding. On hover the border shifts to Signal Violet; the danger variant shifts to Alarm.
- **Hover / Focus:** border-color transition (~150ms ease-out). Focus is a visible ring (2px Signal Violet outline, 2px offset) — never removed; this is a keyboard-driven control surface.

### Chips / Buses

- **Style:** the transport buses are full pills — Booth Surface fill, Ink-dim label, 1px Hairline border, 4px 10px padding.
- **State:** each bus carries a persistent hue identity (violet = mic, teal = monitor) so routing is readable at a glance; the bus is never ambiguous about which destination it controls.

### Cards / Containers

- **Corner Style:** 12px (`--rounded-card`) — the largest radius in the system, and it tops out here.
- **Background:** Card Surface (#1c2230).
- **Shadow Strategy:** none at rest (see Elevation). Hover shifts the border to Signal Violet — the card "lights up" for selection, it does not lift.
- **Border:** 1px Hairline, shifting to Signal Violet on hover.
- **Internal Padding:** 12px.

### Inputs / Fields

- **Style:** Console Black fill (sinks below the panel), Ink text, 1px Hairline border, 8px corners, 8px 10px padding. The search field is the canonical input.
- **Focus:** border shifts to Signal Violet; no glow halo.
- **Error / Disabled:** Alarm border on error; disabled drops to Ink-dim text and locks the border.

### Navigation

- **Style:** transparent nav items, Ink-dim text, 7px 10px padding, 8px corners. Hover lifts to Card Surface + Ink. The active item fills with Signal Violet at 15% alpha, text goes Signal Violet, border at 30% — selected, not shouting.

### Signature Component — The Clip Card

The clip card is the firing surface: a 12px-cornered Card Surface tile with the clip name (600 weight) and category label (tracked-uppercase Label). Two actions sit at its foot — **🔊 Mic** (broadcast, the primary intent) and **🎧 Preview** (monitor-only, the "let me hear it first" intent). The two-button split _is_ the two-bus model, expressed per clip. Hover lights the border Signal Violet; firing is the moment that earns motion.

## 6. Do's and Don'ts

### Do:

- **Do** bind Signal Violet to mic/broadcast and Monitor Teal to headphones/monitor, always. The two-voice split is the product (The Two-Voice Rule).
- **Do** keep Signal Violet to ≤10% of any screen — active state and broadcast action only (The Rare-Accent Rule).
- **Do** carry depth with tonal layering (Console Black → Booth Surface → Card Surface) and 1px Hairline borders; reach for the single Ambient Lift shadow only on genuinely floating surfaces.
- **Do** give every interactive element a visible focus ring (2px Signal Violet, 2px offset) — SoundGrid is driven by hotkeys and keyboards.
- **Do** make the clip-fire moment the one place motion earns its keep: a short, tactile micro-interaction, suppressed under `prefers-reduced-motion`.
- **Do** use the tracked-uppercase 11px Label only to name a bus, category, or settings group (The Label-Means-Structure Rule).

### Don't:

- **Don't** ship the **cluttered freeware skin** — no 2000s media-player chrome, no faux-neon reflections, no every-control-visible-at-once button stacks. Surface only what the moment needs.
- **Don't** ship the **generic Electron gray** — the flat, defaulty, undifferentiated dark every starter template wears. If the interface could be any Electron app's, it has failed.
- **Don't** use `background-clip: text` gradients on text. Signal Violet and Monitor Teal are solid colors; emphasis comes from weight and size, not gradient fills.
- **Don't** pair a 1px border with a wide (≥16px blur) drop shadow on the same element. Pick the Hairline border _or_ the Ambient Lift shadow, never both as decoration.
- **Don't** round cards past 12px. 12px is the ceiling; 24/28/32px is "insanely rounded" and reads as a template tell.
- **Don't** use a `border-left`/`border-right` >1px as a colored side-stripe accent. Lead with full borders, tints, or nothing.
- **Don't** introduce a third signal color, or use Alarm for anything but failure/destruction.
