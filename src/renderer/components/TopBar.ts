import { icon } from "./icons";
import { store } from "./store";
import { BusMeter } from "./BusMeter";

// Top transport bar: the two-bus model is always visible here. Violet is
// broadcast/mic, teal is monitor/headphones, matching the design system.

export function TopBar(): HTMLElement {
  const el = document.createElement("header");
  el.className = "topbar";

  const brand = document.createElement("div");
  brand.className = "brand";
  const logo = document.createElement("span");
  logo.className = "brand-logo";
  logo.append(icon.logo());
  const name = document.createElement("span");
  name.className = "brand-name";
  name.textContent = "SoundGrid";
  brand.append(logo, name);

  const buses = document.createElement("div");
  buses.className = "topbar-buses";
  buses.append(
    BusMeter({
      bus: "mic",
      label: "Mic out",
      sub: "what others hear",
      icon: icon.mic,
    }),
    BusMeter({
      bus: "monitor",
      label: "Headphones",
      sub: "what you hear",
      icon: icon.headphones,
    }),
  );

  const right = document.createElement("div");
  right.className = "topbar-right";

  const update = document.createElement("button");
  update.type = "button";
  update.className = "topbar-update";
  update.hidden = true;
  update.setAttribute("aria-live", "polite");
  update.append(icon.bolt());
  const updateLabel = document.createElement("span");
  update.append(updateLabel);
  update.addEventListener("click", async () => {
    const state = store.state.updateState;
    if (state.status === "available") await window.soundgrid.downloadUpdate();
    else if (state.status === "downloaded")
      await window.soundgrid.installUpdate();
  });

  const stopAll = document.createElement("button");
  stopAll.type = "button";
  stopAll.className = "stop-all topbar-stop";
  stopAll.title = "Stop everything";
  stopAll.setAttribute("aria-label", "Stop all");
  stopAll.append(icon.stop());
  const stopLabel = document.createElement("span");
  stopLabel.textContent = "Stop all";
  stopAll.append(stopLabel);
  stopAll.addEventListener("click", async () => {
    await window.soundgrid.micStopAll();
    store.update({ micPlaying: null, monitorPlaying: null });
  });

  const gear = document.createElement("button");
  gear.className = "icon-btn";
  gear.type = "button";
  gear.title = "Settings";
  gear.setAttribute("aria-label", "Open settings");
  gear.append(icon.gear());
  gear.addEventListener("click", () => store.update({ settingsOpen: true }));

  right.append(update, stopAll, gear);
  el.append(brand, buses, right);
  return el;
}

// The buses update through syncBusMeter; this remains as a light hook for
// future top-bar-only state.
export function syncTopBar(): void {
  document
    .querySelector(".topbar")
    ?.classList.toggle(
      "has-muted-bus",
      store.state.micMuted || store.state.monitorMuted,
    );
  const update = document.querySelector<HTMLButtonElement>(".topbar-update");
  const label = update?.querySelector("span");
  if (!update || !label) return;
  const state = store.state.updateState;
  update.hidden = !["available", "downloading", "downloaded"].includes(
    state.status,
  );
  update.disabled = state.status === "downloading";
  if (state.status === "available") {
    label.textContent = `Update ${state.version}`;
    update.title = `Download SoundGrid ${state.version}`;
  } else if (state.status === "downloading") {
    label.textContent = `Downloading ${Math.round(state.percent)}%`;
    update.title = `Downloading SoundGrid ${state.version}`;
  } else if (state.status === "downloaded") {
    label.textContent = "Restart to update";
    update.title = `Install SoundGrid ${state.version}`;
  }
}
