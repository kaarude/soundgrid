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

Changes to audio routing should describe the hardware and operating-system
version used for validation. Changes to driver setup or packaging must retain
the VB-Audio and BlackHole attribution; the bundled Windows payload must also
retain checksum verification. Do not add telemetry without a separate,
explicit product decision and opt-in design.
