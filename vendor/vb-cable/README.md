# VB-CABLE build payload

SoundGrid downloads the unmodified `VBCABLE_Driver_Pack45.zip` from VB-Audio
during a Windows distribution build. The pinned SHA-256 is checked before the
package is included.

VB-CABLE is separate donationware by VB-Audio Software. It is not covered by
SoundGrid's MIT license. Distribution terms:
https://vb-audio.com/Services/licensing.htm

Run `pnpm vendor:vb-cable` to fetch and verify the payload locally.
