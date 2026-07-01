# Contributing

Read `PRODUCT.md` and `DESIGN.md` before changing user-facing behavior. The
two-bus routing model is load-bearing: violet always means mic/broadcast and
teal always means private monitor output.

Before opening a pull request, run:

```bash
pnpm check
pnpm test
pnpm build
cargo test --locked --manifest-path native/audio-engine/Cargo.toml
```

Changes to audio routing should describe the hardware and Windows version used
for validation. Changes to the driver payload or installer must retain the
VB-Audio attribution and checksum verification. Do not add telemetry without a
separate, explicit product decision and opt-in design.
