# Troubleshooting

> [!IMPORTANT]
> **The macOS version is not working yet.** Its microphone permission prompt can repeat forever after either response, and the interface can be clipped instead of resizing with the window. There is currently no supported workaround; the preview must not be treated as a functional macOS release.

## Other applications cannot hear clips

1. Open Settings and confirm **Mic output device** is `CABLE Input` on Windows or `BlackHole 2ch` on macOS.
2. In Discord, OBS, or the game, select `CABLE Output` on Windows or `BlackHole 2ch` on macOS as the microphone.
3. Confirm the mic bus is not muted and its meter moves when a clip fires.
4. Restart Windows after VB-CABLE installation. On macOS, quit and reopen SoundGrid after installing BlackHole, then use **Refresh audio devices** in Settings.

## I cannot hear previews

Select the physical headphones under **Headphone device**, confirm the monitor
bus is not muted, and disable Mic-only mode.

## My voice disappeared

Enable **Passthrough real mic** and select the physical microphone. The mic-bus
meter should react to speech even when no clip is playing.

## A saved device is unavailable

Reconnect it or select another device in Settings. Device identifiers can
change after driver reinstallations. Auto-select mic can restore safe defaults
when no route has been selected.

## A shortcut will not save

The shortcut is invalid, duplicates another SoundGrid binding, or is already
reserved by the operating system or another application. Choose a modified
shortcut or a function key. Standard macOS shortcuts do not require
Accessibility permission; Electron only requires it for media-key shortcuts,
which SoundGrid does not currently expose.

## Microphone passthrough is unavailable on macOS

This is a confirmed blocker in `v0.2.0-beta.3`: the permission request may
repeat after either **Allow** or **Don't Allow** is selected. Changing the
system permission does not currently make the preview supported or reliable.

## Settings or the library were corrupted

SoundGrid preserves the unreadable file beside the replacement with a
`.corrupt-<timestamp>` suffix. This file can be attached to a private bug report
after removing personal paths.
