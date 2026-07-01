# Troubleshooting

## Other applications cannot hear clips

1. Open Settings and confirm **Mic output device** is `CABLE Input`.
2. In Discord, OBS, or the game, select `CABLE Output` as the microphone.
3. Confirm the mic bus is not muted and its meter moves when a clip fires.
4. Restart Windows if VB-CABLE was just installed.

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
reserved by Windows or another application. Choose a modified shortcut or a
function key.

## Settings or the library were corrupted

SoundGrid preserves the unreadable file beside the replacement with a
`.corrupt-<timestamp>` suffix. This file can be attached to a private bug report
after removing personal paths.
