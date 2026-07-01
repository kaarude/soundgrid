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

  if (!store.state.settings.onboardingComplete) library.append(SetupGuide());

  if (clips.length === 0) return;

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
  const tools = document.createElement("div");
  tools.className = "library-tools";
  const select = document.createElement("button");
  select.type = "button";
  select.className = "library-select";
  select.textContent = store.state.bulkSelecting
    ? "Cancel selection"
    : "Select";
  select.setAttribute("aria-pressed", String(store.state.bulkSelecting));
  select.addEventListener("click", () =>
    store.update({
      bulkSelecting: !store.state.bulkSelecting,
      selectedClipIds: [],
    }),
  );
  tools.append(select);
  if (store.state.bulkSelecting) {
    const allSelected =
      list.length > 0 &&
      list.every((clip) => store.state.selectedClipIds.includes(clip.id));
    const all = document.createElement("button");
    all.type = "button";
    all.className = "library-select";
    all.textContent = allSelected ? "Clear all" : "Select all";
    all.addEventListener("click", () =>
      store.update({
        selectedClipIds: allSelected ? [] : list.map((clip) => clip.id),
      }),
    );
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "library-select library-select--danger";
    remove.textContent = `Remove (${store.state.selectedClipIds.length})`;
    remove.disabled = store.state.selectedClipIds.length === 0;
    remove.addEventListener("click", () => void removeSelected());
    tools.append(all, remove);
  }
  tools.append(collapse);
  header.append(tabs, tools);
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

async function removeSelected(): Promise<void> {
  const ids = [...store.state.selectedClipIds];
  try {
    await Promise.all(ids.map((id) => window.soundgrid.removeClip(id)));
    store.update({
      clips: store.state.clips.filter((clip) => !ids.includes(clip.id)),
      selectedClipIds: [],
      bulkSelecting: false,
    });
  } catch (error) {
    store.update({
      audioError:
        error instanceof Error
          ? error.message
          : "Could not remove the selected clips.",
    });
  }
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

function SetupGuide(): HTMLElement {
  const card = document.createElement("div");
  card.className = "firstrun";

  const iconWrap = document.createElement("div");
  iconWrap.className = "firstrun-icon";
  iconWrap.append(icon.mic());

  const title = document.createElement("h2");
  title.textContent = "Set up your cue rack";

  const body = document.createElement("p");
  body.textContent =
    "Complete these checks once. SoundGrid will remember the routing and keep the guide available until everything is ready.";

  const steps = document.createElement("ol");
  steps.className = "firstrun-steps";
  const cableReady = Boolean(store.state.cableStatus?.installed);
  const routingReady = Boolean(
    store.state.settings.micOutputDeviceId &&
    store.state.settings.monitorDeviceId &&
    (!store.state.settings.passthrough || store.state.settings.realMicDeviceId),
  );
  const clipsReady = store.state.clips.length > 0;
  const s1 = setupStep("Install the virtual audio cable", cableReady);
  const s2 = setupStep(
    "Confirm mic, monitor, and passthrough routing",
    routingReady,
  );
  const s3 = setupStep("Import at least one audio clip", clipsReady);
  steps.append(s1, s2, s3);

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "firstrun-cta";
  settings.textContent = cableReady
    ? "Configure routing"
    : "Install and configure";
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

  const complete = document.createElement("button");
  complete.type = "button";
  complete.className = "firstrun-complete";
  complete.textContent = "Finish setup";
  complete.disabled = !(cableReady && routingReady && clipsReady);
  complete.addEventListener("click", async () => {
    const result = await window.soundgrid.setSettings({
      onboardingComplete: true,
    });
    store.update({ settings: result.settings });
  });

  card.append(iconWrap, title, body, steps, settings, importButton, complete);
  return card;
}

function setupStep(label: string, complete: boolean): HTMLLIElement {
  const step = document.createElement("li");
  step.className = complete ? "is-complete" : "";
  step.textContent = `${complete ? "Complete" : "Pending"}: ${label}`;
  return step;
}
