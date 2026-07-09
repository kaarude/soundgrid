import { SoundClip, SoundClipPatch } from "../../shared/types";
import { icon } from "./icons";
import { store } from "./store";
import {
  captureHotkey,
  findHotkeyConflict,
  formatHotkey,
  normalizeAccelerator,
  validateAccelerator,
} from "./hotkey-utils";

// A single clip card — the firing surface. The main play action hits both
// buses; the Mic and Preview buttons remain route-specific controls.
// Hover lights the hairline border Signal Violet (The Flat-At-Rest Rule).

export function SoundCard(clip: SoundClip): HTMLElement {
  const card = document.createElement("article");
  card.className = "card";
  card.classList.toggle("is-missing", Boolean(clip.missing));
  card.dataset.clipId = clip.id;
  card.tabIndex = 0;
  const routeLabel = clip.broadcast ? "mic and monitor" : "monitor only";
  card.setAttribute("aria-label", `${clip.name}. Fire to ${routeLabel}`);
  card.title = `Fire to ${routeLabel}`;
  if (clip.missing) {
    card.title =
      "Audio file is missing. Remove this entry or restore the file.";
    card.setAttribute("aria-disabled", "true");
  }
  card.addEventListener("click", () => {
    if (store.state.bulkSelecting) {
      toggleSelectedClip(clip.id);
    } else if (!clip.missing) void fireBoth(clip, card);
  });
  card.addEventListener("keydown", (event) => {
    if (event.target !== card) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (store.state.bulkSelecting) toggleSelectedClip(clip.id);
    else if (!clip.missing) void fireBoth(clip, card);
  });

  const top = document.createElement("div");
  top.className = "card-top";
  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = clip.name;
  top.append(name);
  if (store.state.bulkSelecting) {
    const selection = document.createElement("input");
    selection.type = "checkbox";
    selection.className = "card-selection";
    selection.checked = store.state.selectedClipIds.includes(clip.id);
    selection.setAttribute("aria-label", `Select ${clip.name}`);
    selection.addEventListener("click", (event) => event.stopPropagation());
    selection.addEventListener("change", () => {
      toggleSelectedClip(clip.id, selection.checked);
    });
    top.prepend(selection);
    card.classList.add("is-selecting");
  }

  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className = "card-favorite" + (clip.favorite ? " is-favorite" : "");
  favorite.title = clip.favorite ? "Remove from favorites" : "Add to favorites";
  favorite.setAttribute("aria-label", favorite.title);
  favorite.setAttribute("aria-pressed", String(clip.favorite));
  favorite.append(icon.star());
  favorite.addEventListener("click", async (event) => {
    event.stopPropagation();
    const next = !clip.favorite;
    const result = await window.soundgrid.updateClip(clip.id, {
      favorite: next,
    });
    const clips = store.state.clips.map((item) =>
      item.id === clip.id ? result.clip : item,
    );
    const hasFavorites = clips.some((item) => item.favorite);
    store.update({
      clips,
      activeLibraryView: hasFavorites ? store.state.activeLibraryView : "all",
    });
  });

  const metadata = document.createElement("div");
  metadata.className = "card-meta";
  const both = document.createElement("span");
  both.className = "route-badge";
  both.classList.add(
    clip.broadcast ? "route-badge--broadcast" : "route-badge--monitor",
  );
  both.textContent = clip.broadcast ? "Mic + monitor" : "Monitor only";
  metadata.append(both);
  if (clip.missing) {
    both.className = "route-badge route-badge--missing";
    both.textContent = "File missing";
  }
  if (clip.hotkey) {
    const hotkey = document.createElement("kbd");
    hotkey.className = "hotkey-badge";
    hotkey.textContent = formatHotkey(clip.hotkey);
    hotkey.title = `Global hotkey: ${clip.hotkey}`;
    metadata.append(hotkey);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const micBtn = document.createElement("button");
  micBtn.type = "button";
  micBtn.className = "card-btn card-btn--mic";
  micBtn.title = "Play to mic (broadcast)";
  micBtn.disabled = !clip.broadcast;
  if (clip.missing) micBtn.disabled = true;
  if (!clip.broadcast) micBtn.title = "Monitor-only clips cannot be broadcast";
  micBtn.append(icon.mic());
  const micLabel = document.createElement("span");
  micLabel.textContent = "Mic";
  micBtn.append(micLabel);
  micBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    micBtn.classList.remove("is-firing");
    void micBtn.offsetWidth; // restart the animation
    micBtn.classList.add("is-firing");
    void fireMic(clip);
  });

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "card-btn card-btn--preview";
  prevBtn.title = "Preview on headphones only";
  prevBtn.disabled = Boolean(clip.missing);
  prevBtn.append(icon.headphones());
  const prevLabel = document.createElement("span");
  prevLabel.textContent = "Preview";
  prevBtn.append(prevLabel);
  prevBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    void firePreview(clip);
  });

  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = "card-menu";
  menuBtn.title = "Clip settings";
  menuBtn.setAttribute("aria-haspopup", "menu");
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.setAttribute("aria-label", `Settings for ${clip.name}`);
  menuBtn.append(icon.more());
  menuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const wasOpen = card.classList.contains("is-menu-open");
    closeOtherMenus(card);
    card.classList.toggle("is-menu-open", !wasOpen);
    menuBtn.setAttribute("aria-expanded", String(!wasOpen));
    if (!wasOpen) {
      const menu = card.querySelector<HTMLElement>(".clip-menu");
      menu?.classList.remove("is-positioned");
      requestAnimationFrame(() => {
        if (!card.classList.contains("is-menu-open")) return;
        positionMenu(card, menuBtn);
        menu?.classList.add("is-positioned");
      });
    }
  });

  actions.append(micBtn, prevBtn);
  card.append(
    top,
    metadata,
    actions,
    favorite,
    menuBtn,
    ClipSettingsMenu(clip, card),
  );
  return card;
}

function toggleSelectedClip(id: string, force?: boolean): void {
  const selected = new Set(store.state.selectedClipIds);
  const shouldSelect = force ?? !selected.has(id);
  if (shouldSelect) selected.add(id);
  else selected.delete(id);
  store.update({ selectedClipIds: [...selected] });
}

function ClipSettingsMenu(clip: SoundClip, card: HTMLElement): HTMLElement {
  const form = document.createElement("form");
  form.className = "clip-menu";
  form.setAttribute("aria-label", `Settings for ${clip.name}`);
  form.addEventListener("click", (event) => event.stopPropagation());

  const name = textField("Name", clip.name);
  const hotkey = textField("Hotkey", clip.hotkey ?? "");
  hotkey.input.placeholder = "Click, then press keys";
  hotkey.input.readOnly = true;
  hotkey.input.setAttribute("aria-describedby", `hotkey-help-${clip.id}`);
  hotkey.input.addEventListener("keydown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hotkey.input.value = captureHotkey(event);
    error.textContent = "";
  });
  const hotkeyHelp = document.createElement("span");
  hotkeyHelp.id = `hotkey-help-${clip.id}`;
  hotkeyHelp.className = "clip-field-help";
  hotkeyHelp.textContent = "Press a shortcut. Backspace or Escape clears it.";
  hotkey.label.append(hotkeyHelp);

  const volume = document.createElement("label");
  volume.className = "clip-field clip-field--volume";
  const volumeHead = document.createElement("span");
  volumeHead.className = "clip-volume-head";
  const volumeLabel = document.createElement("span");
  volumeLabel.textContent = "Volume";
  const volumeValue = document.createElement("span");
  volumeValue.className = "clip-volume-value";
  volumeValue.textContent = `${Math.round(clip.volume * 100)}%`;
  volumeHead.append(volumeLabel, volumeValue);
  const volumeTrack = document.createElement("span");
  volumeTrack.className = "clip-volume";
  const volumeInput = document.createElement("input");
  volumeInput.type = "range";
  volumeInput.min = "0";
  volumeInput.max = "100";
  volumeInput.value = String(Math.round(clip.volume * 100));
  updateVolumeControl(volumeInput, volumeValue);
  volumeInput.addEventListener("input", () => {
    updateVolumeControl(volumeInput, volumeValue);
  });
  volumeTrack.append(volumeInput);
  volume.append(volumeHead, volumeTrack);

  const trim = document.createElement("fieldset");
  trim.className = "clip-trim";
  const trimLegend = document.createElement("legend");
  trimLegend.textContent = "Trim";
  const trimFields = document.createElement("div");
  trimFields.className = "clip-trim-fields";
  const trimStart = numberField("Start (seconds)", clip.trimStart);
  const trimEnd = numberField("End (seconds)", clip.trimEnd);
  trimFields.append(trimStart.label, trimEnd.label);
  const trimHelp = document.createElement("span");
  trimHelp.className = "clip-field-help";
  trimHelp.textContent = "Skip time from the beginning or end of playback.";
  trim.append(trimLegend, trimFields, trimHelp);

  const loop = document.createElement("label");
  loop.className = "clip-check";
  const loopInput = document.createElement("input");
  loopInput.type = "checkbox";
  loopInput.checked = clip.loop;
  const loopBox = document.createElement("span");
  loopBox.className = "clip-check-box";
  const loopText = document.createElement("span");
  loopText.textContent = "Loop";
  loop.append(loopInput, loopBox, loopText);

  const route = document.createElement("fieldset");
  route.className = "clip-route";
  const routeLegend = document.createElement("legend");
  routeLegend.textContent = "Default route";
  const routeOptions = document.createElement("div");
  routeOptions.className = "clip-route-options";
  const broadcastRoute = routeOption(
    `route-broadcast-${clip.id}`,
    "Broadcast + monitor",
    "Mic and headphones",
    true,
    clip.broadcast,
  );
  const monitorRoute = routeOption(
    `route-monitor-${clip.id}`,
    "Monitor only",
    "Headphones only",
    false,
    !clip.broadcast,
  );
  routeOptions.append(broadcastRoute.label, monitorRoute.label);
  route.append(routeLegend, routeOptions);

  const error = document.createElement("div");
  error.className = "clip-menu-error";
  error.setAttribute("role", "status");
  error.setAttribute("aria-live", "polite");

  const footer = document.createElement("div");
  footer.className = "clip-menu-actions";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "clip-menu-remove";
  remove.append(icon.trash(), document.createTextNode("Remove"));
  remove.addEventListener("click", async () => {
    setFormPending(form, true);
    try {
      await window.soundgrid.removeClip(clip.id);
      store.update({
        clips: store.state.clips.filter((item) => item.id !== clip.id),
      });
    } catch (cause) {
      error.textContent = errorMessage(cause, "Could not remove this clip.");
      setFormPending(form, false);
    }
  });
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "clip-menu-save";
  save.textContent = "Save";
  footer.append(remove, save);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const normalizedHotkey = normalizeAccelerator(hotkey.input.value);
    const invalid = validateAccelerator(normalizedHotkey);
    if (invalid) {
      error.textContent = invalid;
      hotkey.input.focus();
      return;
    }
    const conflict = findHotkeyConflict(
      clip.id,
      normalizedHotkey,
      store.state.clips,
      store.state.settings,
    );
    if (conflict) {
      error.textContent = `Hotkey already used by ${conflict}.`;
      hotkey.input.focus();
      return;
    }

    const patch: SoundClipPatch = {
      name: name.input.value,
      hotkey: normalizedHotkey || null,
      volume: Number(volumeInput.value) / 100,
      trimStart: Number(trimStart.input.value),
      trimEnd: Number(trimEnd.input.value),
      loop: loopInput.checked,
      broadcast: broadcastRoute.input.checked,
    };
    setFormPending(form, true);
    try {
      const result = await window.soundgrid.updateClip(clip.id, patch);
      const failed = result.hotkeys.failures.find(
        (item) => item.id === clip.id,
      );
      if (failed) {
        const message =
          failed.reason === "unavailable"
            ? "Saved, but Windows or another app already owns this shortcut."
            : "Saved, but Electron does not support this shortcut.";
        store.update({
          clips: store.state.clips.map((item) =>
            item.id === clip.id ? result.clip : item,
          ),
        });
        reopenMenuWithError(clip.id, message);
        return;
      }
      store.update({
        clips: store.state.clips.map((item) =>
          item.id === clip.id ? result.clip : item,
        ),
      });
      closeMenu(card, true);
    } catch (cause) {
      error.textContent = errorMessage(cause, "Could not save clip settings.");
      setFormPending(form, false);
    }
  });

  form.append(
    name.label,
    hotkey.label,
    volume,
    trim,
    loop,
    route,
    error,
    footer,
  );
  return form;
}

function reopenMenuWithError(clipId: string, message: string): void {
  const card = Array.from(
    document.querySelectorAll<HTMLElement>(".card[data-clip-id]"),
  ).find((item) => item.dataset.clipId === clipId);
  const trigger = card?.querySelector<HTMLButtonElement>(".card-menu");
  trigger?.click();

  const menu = card?.querySelector<HTMLFormElement>(".clip-menu");
  const error = menu?.querySelector<HTMLElement>(".clip-menu-error");
  if (error) error.textContent = message;
  menu?.querySelector<HTMLInputElement>("input[readonly]")?.focus();
}

function routeOption(
  id: string,
  title: string,
  description: string,
  value: boolean,
  checked: boolean,
) {
  const label = document.createElement("label");
  label.className = "clip-route-option";
  label.htmlFor = id;
  const input = document.createElement("input");
  input.id = id;
  input.type = "radio";
  input.name = `route-${id.split("-").at(-1)}`;
  input.value = String(value);
  input.checked = checked;
  const copy = document.createElement("span");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("small");
  detail.textContent = description;
  copy.append(heading, detail);
  label.append(input, copy);
  return { label, input };
}

function textField(labelText: string, value: string) {
  const label = document.createElement("label");
  label.className = "clip-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  label.append(span, input);
  return { label, input };
}

function numberField(labelText: string, value: number) {
  const label = document.createElement("label");
  label.className = "clip-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "600";
  input.step = "0.01";
  input.value = String(value);
  label.append(span, input);
  return { label, input };
}

function closeOtherMenus(card: HTMLElement) {
  for (const open of document.querySelectorAll<HTMLElement>(
    ".card.is-menu-open",
  )) {
    if (open !== card) closeMenu(open);
  }
}

function closeMenu(card: HTMLElement, restoreFocus = false) {
  card.classList.remove("is-menu-open");
  const menu = card.querySelector<HTMLElement>(".clip-menu");
  const trigger = card.querySelector<HTMLButtonElement>(".card-menu");
  menu?.classList.remove("is-positioned");
  trigger?.setAttribute("aria-expanded", "false");
  if (restoreFocus) trigger?.focus();
}

function positionMenu(card: HTMLElement, anchor: HTMLElement) {
  const menu = card.querySelector<HTMLElement>(".clip-menu");
  if (!menu) return;

  const gap = 8;
  const margin = 12;
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(268, window.innerWidth - margin * 2);
  menu.style.width = `${width}px`;
  menu.style.maxHeight = `${Math.max(180, window.innerHeight - margin * 2)}px`;

  const menuHeight = menu.offsetHeight;
  const fitsRight = rect.right + gap + width <= window.innerWidth - margin;
  const preferredLeft = fitsRight ? rect.right + gap : rect.left - width - gap;
  const left = Math.max(
    margin,
    Math.min(window.innerWidth - width - margin, preferredLeft),
  );
  const top = Math.max(
    margin,
    Math.min(window.innerHeight - menuHeight - margin, rect.top - 4),
  );

  menu.dataset.placement = fitsRight ? "right" : "left";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function updateVolumeControl(
  input: HTMLInputElement,
  value: HTMLElement,
): void {
  const pct = Number(input.value);
  value.textContent = `${pct}%`;
  input.style.setProperty("--clip-volume-pct", `${pct}%`);
}

async function fireBoth(clip: SoundClip, source?: HTMLElement): Promise<void> {
  if (source?.classList.contains("is-menu-open")) return;
  source?.classList.remove("is-firing");
  if (source) void source.offsetWidth;
  source?.classList.add("is-firing");
  await window.soundgrid.playBoth(clip.id);
}

async function fireMic(clip: SoundClip): Promise<void> {
  await window.soundgrid.micPlay(clip.id);
}

async function firePreview(clip: SoundClip): Promise<void> {
  await window.soundgrid.monitorPlay(clip.id);
}

function setFormPending(form: HTMLFormElement, pending: boolean): void {
  form.setAttribute("aria-busy", String(pending));
  const save = form.querySelector<HTMLButtonElement>(".clip-menu-save");
  if (save) save.textContent = pending ? "Saving…" : "Save";
  for (const control of form.elements) {
    if (
      control instanceof HTMLButtonElement ||
      control instanceof HTMLInputElement
    ) {
      control.disabled = pending;
    }
  }
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

document.addEventListener("click", () => {
  for (const open of document.querySelectorAll<HTMLElement>(
    ".card.is-menu-open",
  )) {
    closeMenu(open);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const open = document.querySelector<HTMLElement>(".card.is-menu-open");
  if (!open) return;
  event.preventDefault();
  closeMenu(open, true);
});

window.addEventListener("resize", () => {
  for (const open of document.querySelectorAll<HTMLElement>(
    ".card.is-menu-open",
  )) {
    const anchor = open.querySelector<HTMLElement>(".card-menu");
    if (anchor) positionMenu(open, anchor);
  }
});

document.addEventListener(
  "scroll",
  () => {
    for (const open of document.querySelectorAll<HTMLElement>(
      ".card.is-menu-open",
    )) {
      const anchor = open.querySelector<HTMLElement>(".card-menu");
      if (anchor) positionMenu(open, anchor);
    }
  },
  { capture: true, passive: true },
);
