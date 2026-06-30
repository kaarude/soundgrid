import { icon } from "./icons";
import { importAudioFiles } from "./library-actions";
import { store } from "./store";
import { SoundCard } from "./SoundCard";

// Center: the clip grid + the guided first-run / empty state.
// The empty state teaches the one hard thing — mic injection needs a
// virtual audio cable — then offers the Import CTA.

export function ClipGrid(): HTMLElement {
  const el = document.createElement("main");
  el.className = "grid";
  el.setAttribute("aria-label", "Sound clips");
  return el;
}

export function syncClipGrid(): void {
  const grid = document.querySelector<HTMLElement>(".grid");
  if (!grid) return;
  const { clips, filter, activeCategory } = store.state;
  const list = clips.filter((c) => {
    const inCat = activeCategory === "All" || c.category === activeCategory;
    const inSearch = !filter || c.name.toLowerCase().includes(filter);
    return inCat && inSearch;
  });

  grid.innerHTML = "";

  if (clips.length === 0) {
    grid.append(FirstRun());
    return;
  }
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "grid-empty";
    empty.textContent = "No clips match your search.";
    grid.append(empty);
    return;
  }

  for (const clip of list) grid.append(SoundCard(clip));
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
