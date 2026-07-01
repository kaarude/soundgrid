# Security policy

Report vulnerabilities privately through GitHub's security-advisory feature
for `kaarude/soundgrid`. Do not include microphone recordings, personal audio,
tokens, or private file paths in a public issue.

SoundGrid uses Electron context isolation, disables renderer Node integration,
sandboxes the renderer, blocks renderer navigation, and only opens explicit
HTTP(S) links externally. Release artifacts should be built by the tagged CI
workflow. Public releases must be code-signed before being presented as stable.

The bundled VB-CABLE archive is downloaded from VB-Audio and checked against a
pinned SHA-256 during the release build. It remains third-party donationware.
