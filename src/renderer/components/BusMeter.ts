import { icon } from "./icons";
import { NowPlaying, store } from "./store";

// One bus meter in the right console column. Each bus has its OWN transport
// (play/pause/stop), mute, and volume — so the mic player can be paused
// independently of the headphone monitor. This is where the original plan's
// "pause player only for the microphone" + "independent headphone output" live.

type Bus = "mic" | "monitor";

interface BusConfig {
  bus: Bus;
  label: string;
  sub: string;
  icon: () => SVGElement;
}

export function BusMeter(cfg: BusConfig): HTMLElement {
  const el = document.createElement("section");
  el.className = `bus bus--${cfg.bus}`;
  el.dataset.bus = cfg.bus;

  // header
  const head = document.createElement("div");
  head.className = "bus-head";
  const headIcon = document.createElement("span");
  headIcon.className = "bus-head-icon";
  headIcon.append(cfg.icon());
  const headText = document.createElement("div");
  headText.className = "bus-head-text";
  const label = document.createElement("div");
  label.className = "bus-label";
  label.textContent = cfg.label;
  const sub = document.createElement("div");
  sub.className = "bus-sub";
  sub.textContent = cfg.sub;
  headText.append(label, sub);
  head.append(headIcon, headText);

  // vertical meter
  const meter = document.createElement("div");
  meter.className = "meter";
  meter.setAttribute("role", "meter");
  meter.setAttribute("aria-label", `${cfg.label} level`);
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "100");
  meter.setAttribute("aria-valuenow", "0");
  const fill = document.createElement("div");
  fill.className = "meter-fill";
  const peak = document.createElement("div");
  peak.className = "meter-peak";
  meter.append(fill, peak);

  const readout = document.createElement("div");
  readout.className = "bus-readout";
  readout.textContent = "0%";
  readout.setAttribute("aria-label", `${cfg.label} volume`);

  const nowPlaying = document.createElement("div");
  nowPlaying.className = "bus-now";
  nowPlaying.textContent = "Idle";

  // transport row
  const transport = document.createElement("div");
  transport.className = "bus-transport";

  const playBtn = makeBtn("play", "Play", icon.play(), () =>
    resumeBus(cfg.bus),
  );
  const pauseBtn = makeBtn("pause", "Pause", icon.pause(), () =>
    pauseBus(cfg.bus),
  );
  const stopBtn = makeBtn("stop", "Stop", icon.stop(), () => stopBus(cfg.bus));
  const muteBtn = makeBtn("mute", "Mute", icon.mute(), () =>
    toggleMute(cfg.bus),
  );
  muteBtn.classList.add("bus-mute");
  transport.append(playBtn, pauseBtn, stopBtn, muteBtn);

  // volume
  const volWrap = document.createElement("label");
  volWrap.className = "bus-vol";
  const vol = document.createElement("input");
  vol.type = "range";
  vol.min = "0";
  vol.max = "100";
  vol.setAttribute("aria-label", `${cfg.label} volume`);
  const volVal = document.createElement("span");
  volVal.className = "bus-vol-val";
  vol.addEventListener("input", () =>
    setVolume(cfg.bus, Number(vol.value) / 100),
  );
  volWrap.append(vol, volVal);

  el.append(head, meter, readout, nowPlaying, transport, volWrap);

  // ---- live meter animation ----
  let level = 0; // 0..1
  let target = 0;
  let raf = 0;
  let lastTargetAt = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  const playing = (): NowPlaying | null =>
    cfg.bus === "mic" ? store.state.micPlaying : store.state.monitorPlaying;
  const muted = (): boolean =>
    cfg.bus === "mic" ? store.state.micMuted : store.state.monitorMuted;

  function tick() {
    const now = performance.now();
    const np = playing();
    if (np && !np.paused && !muted()) {
      if (now - lastTargetAt > 120 + Math.random() * 60) {
        const base =
          cfg.bus === "mic" ? store.state.micVolume : store.state.monitorVolume;
        target = Math.min(
          1,
          Math.max(0.04, base * (0.45 + Math.random() * 0.45)),
        );
        lastTargetAt = now;
      }
    } else {
      target = 0;
    }
    if (reduce.matches) {
      level = target;
    } else {
      const smoothing = target > level ? 0.34 : 0.08;
      level += (target - level) * smoothing;
      if (target === 0 && level < 0.001) level = 0;
    }
    const pct = Math.round(level * 100);
    fill.style.height = `${pct}%`;
    peak.style.bottom = `${Math.min(100, pct + 3)}%`;
    meter.setAttribute("aria-valuenow", String(pct));
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  // cleanup hook (not strictly needed for an app-shell singleton)
  el.addEventListener("DOMNodeRemoved", () => cancelAnimationFrame(raf));

  return el;
}

export function syncBusMeter(bus: Bus): void {
  const el = document.querySelector<HTMLElement>(`.bus[data-bus="${bus}"]`);
  if (!el) return;
  const np =
    bus === "mic" ? store.state.micPlaying : store.state.monitorPlaying;
  const muted = bus === "mic" ? store.state.micMuted : store.state.monitorMuted;
  const vol = bus === "mic" ? store.state.micVolume : store.state.monitorVolume;

  const now = el.querySelector<HTMLElement>(".bus-now");
  if (now) {
    if (muted) now.textContent = "Muted";
    else if (np)
      now.textContent = np.paused
        ? `Paused — ${np.name}`
        : `Playing — ${np.name}`;
    else now.textContent = "Idle";
  }

  const muteBtn = el.querySelector<HTMLButtonElement>(".bus-mute");
  if (muteBtn) {
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.classList.toggle("is-active", muted);
  }

  const volInput = el.querySelector<HTMLInputElement>(
    ".bus-vol input",
  ) as HTMLInputElement | null;
  const volVal = el.querySelector<HTMLElement>(".bus-vol-val");
  const readout = el.querySelector<HTMLElement>(".bus-readout");
  if (volInput) {
    const v = Math.round(vol * 100);
    if (Number(volInput.value) !== v) volInput.value = String(v);
    if (volVal) volVal.textContent = `${v}%`;
    if (readout) readout.textContent = `${v}%`;
  }
}

// ---- actions ----
function makeBtn(
  cls: string,
  title: string,
  ico: SVGElement,
  onClick: () => void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `tbtn tbtn--${cls}`;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.append(ico);
  b.addEventListener("click", onClick);
  return b;
}

async function resumeBus(bus: Bus): Promise<void> {
  if (bus === "mic") {
    const np = store.state.micPlaying;
    if (np && np.paused) {
      await window.soundgrid.micResume();
      store.update({ micPlaying: { ...np, paused: false } });
    }
  } else {
    const np = store.state.monitorPlaying;
    if (np && np.paused) {
      await window.soundgrid.monitorResume();
      store.update({ monitorPlaying: { ...np, paused: false } });
    }
  }
}

async function pauseBus(bus: Bus): Promise<void> {
  if (bus === "mic") {
    const np = store.state.micPlaying;
    if (np && !np.paused) {
      await window.soundgrid.micPause();
      store.update({ micPlaying: { ...np, paused: true } });
    }
  } else {
    await window.soundgrid.monitorPause();
    const np = store.state.monitorPlaying;
    if (np) store.update({ monitorPlaying: { ...np, paused: true } });
  }
}

async function stopBus(bus: Bus): Promise<void> {
  if (bus === "mic") {
    await window.soundgrid.micStop();
    store.update({ micPlaying: null });
  } else {
    await window.soundgrid.monitorStop();
    store.update({ monitorPlaying: null });
  }
}

async function toggleMute(bus: Bus): Promise<void> {
  if (bus === "mic") {
    const next = !store.state.micMuted;
    await window.soundgrid.micSetMute(next);
    store.update({ micMuted: next });
  } else {
    const next = !store.state.monitorMuted;
    await window.soundgrid.monitorSetMute(next);
    store.update({ monitorMuted: next });
  }
}

async function setVolume(bus: Bus, v: number): Promise<void> {
  if (bus === "mic") {
    await window.soundgrid.micSetVolume(v);
    store.update({ micVolume: v });
  } else {
    await window.soundgrid.monitorSetVolume(v);
    store.update({ monitorVolume: v });
  }
}
