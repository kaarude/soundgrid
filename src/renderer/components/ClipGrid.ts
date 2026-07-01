import { icon } from "./icons";
import { importAudioFiles } from "./library-actions";
import { store } from "./store";
import { SoundCard } from "./SoundCard";

// Center: the clip grid + the guided first-run / empty state.
// The empty state teaches the one hard thing — mic injection needs a
// virtual audio cable — then offers the Import CTA.

export function ClipGrid(): HTMLElement {
  const el = document.createElement("main");
  el.className = "library";
  el.setAttribute("aria-label", "Sound clips");
  return el;
}

export function syncClipGrid(): void {
  const library = document.querySelector<HTMLElement>(".library");
  if (!library) return;
  const { clips, filter, activeLibraryView, soundsCollapsed } = store.state;
  const hasFavorites = clips.some((clip) => clip.favorite);
  const currentView = hasFavorites ? activeLibraryView : "all";
  const list = clips.filter((c) => {
    const inView = currentView === "all" || c.favorite;
    const inSearch = !filter || c.name.toLowerCase().includes(filter);
    return inView && inSearch;
  });

  library.innerHTML = "";

  if (clips.length === 0) {
    library.append(FirstRun());
    return;
  }

  const header = document.createElement("header");
  header.className = "library-header";
  const tabs = document.createElement("div");
  tabs.className = "library-tabs";
  tabs.setAttribute("role", "tablist");
  if (hasFavorites) tabs.append(ViewTab("favorites", "Favorites"));
  tabs.append(ViewTab("all", "All sounds"));

  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.className = "library-collapse";
  collapse.setAttribute("aria-expanded", String(!soundsCollapsed));
  collapse.setAttribute(
    "aria-label",
    soundsCollapsed ? "Expand sounds" : "Collapse sounds",
  );
  collapse.title = soundsCollapsed ? "Expand sounds" : "Collapse sounds";
  collapse.append(icon.chevron());
  collapse.addEventListener("click", () =>
    store.update({ soundsCollapsed: !store.state.soundsCollapsed }),
  );
  header.append(tabs, collapse);
  library.append(header);

  if (soundsCollapsed) {
    library.classList.add("is-collapsed");
    return;
  }
  library.classList.remove("is-collapsed");

  const grid = document.createElement("div");
  grid.className = "grid";
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "grid-empty";
    empty.textContent = filter
      ? "No sounds match your search."
      : "Star a sound to keep it in Favorites.";
    grid.append(empty);
  } else {
    for (const clip of list) grid.append(SoundCard(clip));
  }
  library.append(grid);
}

function ViewTab(view: "favorites" | "all", label: string): HTMLButtonElement {
  const button = document.createElement("button");
  const selected = store.state.activeLibraryView === view;
  button.type = "button";
  button.className = "library-tab" + (selected ? " is-active" : "");
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", String(selected));
  button.textContent = label;
  button.addEventListener("click", () =>
    store.update({ activeLibraryView: view }),
  );
  return button;
}

function FirstRun(): HTMLElement {
  const card = document.createElement("div");
  card.className = "firstrun";

  const iconWrap = document.createElement("div");
  iconWrap.className = "firstrun-icon";
  iconWrap.append(icon.mic());

  const title = document.createElement("h2");
  title.textContent = "Your cue rack is empty";

  const body = document.createElement("p");
  body.innerHTML =
    "SoundGrid plays clips into your microphone stream. That needs a <strong>virtual audio cable</strong> — a free device other apps can pick as your mic.";

  const steps = document.createElement("ol");
  steps.className = "firstrun-steps";
  const s1 = document.createElement("li");
  s1.innerHTML =
    'Install <a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer">VB-CABLE</a> (free, donationware).';
  const s2 = document.createElement("li");
  s2.textContent = "Open Settings and set “Mic output device” to the cable.";
  const s3 = document.createElement("li");
  s3.textContent =
    "Import clips, then open a clip’s menu to assign a global hotkey.";
  steps.append(s1, s2, s3);

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "firstrun-cta";
  settings.textContent = "Configure routing";
  settings.addEventListener("click", () =>
    store.update({ settingsOpen: true }),
  );

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = "firstrun-settings";
  importButton.append(icon.plus());
  const importLabel = document.createElement("span");
  importLabel.textContent = "Import audio";
  importButton.append(importLabel);
  importButton.addEventListener("click", () => void importAudioFiles());

  card.append(iconWrap, title, body, steps, settings, importButton);
  return card;
}
