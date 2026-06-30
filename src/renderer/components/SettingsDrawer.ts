import { AudioDevice, Settings } from "../../shared/types";
import { icon } from "./icons";
import { store } from "./store";

// Settings drawer, opened from the topbar gear. Routing + toggles.
// This is the control surface — calm, labeled, instrument-precise.

export function SettingsDrawer(): HTMLElement {
  const el = document.createElement("div");
  el.className = "drawer-overlay";
  el.hidden = true;

  const panel = document.createElement("div");
  panel.className = "drawer";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Settings");

  const head = document.createElement("div");
  head.className = "drawer-head";
  const title = document.createElement("h2");
  title.textContent = "Settings";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn";
  close.title = "Close";
  close.setAttribute("aria-label", "Close settings");
  close.append(icon.close());
  close.addEventListener("click", () => store.update({ settingsOpen: false }));
  head.append(title, close);

  const body = document.createElement("div");
  body.className = "drawer-body";

  const routing = document.createElement("section");
  routing.className = "drawer-group";
  routing.innerHTML = `<h3>Routing</h3>`;
  const s = store.state.settings;
  const d = store.state.devices;

  routing.append(
    deviceField(
      "Mic output device",
      "micOutputDeviceId",
      d.micOutputs,
      s.micOutputDeviceId,
      "The virtual cable other apps pick as your mic.",
    ),
    deviceField(
      "Headphone device",
      "monitorDeviceId",
      d.monitors,
      s.monitorDeviceId,
      "Where you hear the monitor bus.",
    ),
    deviceField(
      "Real mic (passthrough)",
      "realMicDeviceId",
      d.realMics,
      s.realMicDeviceId,
      "Mixed into the mic output so your voice is still heard.",
    ),
  );

  const behavior = document.createElement("section");
  behavior.className = "drawer-group";
  behavior.innerHTML = `<h3>Behavior</h3>`;
  behavior.append(
    toggleField("Passthrough real mic", "passthrough", s.passthrough),
    toggleField(
      "Headset-only mode",
      "headsetOnly",
      s.headsetOnly,
      "Never leak monitor audio to speakers.",
    ),
    toggleField(
      "Mic-only mode",
      "micOnly",
      s.micOnly,
      "Send to mic, hear nothing locally.",
    ),
    selectField(
      "Overlap behavior",
      "overlap",
      ["stop", "overlap", "queue"],
      s.overlap,
    ),
  );

  const system = document.createElement("section");
  system.className = "drawer-group";
  system.innerHTML = `<h3>System</h3>`;
  system.append(
    toggleField("Run on startup", "runOnStartup", s.runOnStartup),
    toggleField("Minimize to tray", "minimizeToTray", s.minimizeToTray),
    toggleField("Auto-select mic", "autoSelectMic", s.autoSelectMic),
    selectField("Theme", "theme", ["dark", "light", "system"], s.theme),
  );

  body.append(routing, behavior, system);
  panel.append(head, body);
  el.append(panel);

  el.addEventListener("click", (e) => {
    if (e.target === el) store.update({ settingsOpen: false });
  });
  return el;
}

export function syncSettingsDrawer(): void {
  const overlay = document.querySelector<HTMLElement>(".drawer-overlay");
  if (!overlay) return;
  overlay.hidden = !store.state.settingsOpen;
}

// ---- field builders ----
function deviceField(
  label: string,
  key: keyof Settings,
  devices: AudioDevice[],
  selected: string | null,
  help: string,
): HTMLElement {
  const field = document.createElement("div");
  field.className = "field";
  const lab = document.createElement("label");
  lab.className = "field-label";
  lab.textContent = label;
  const select = document.createElement("select");
  select.dataset.setting = String(key);
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = devices.length ? "— select —" : "No device found";
  select.append(ph);
  for (const dev of devices) {
    const o = document.createElement("option");
    o.value = dev.id;
    o.textContent = dev.label;
    if (dev.id === selected) o.selected = true;
    select.append(o);
  }
  select.addEventListener("change", () =>
    persistSetting(key, select.value || null),
  );
  const hint = document.createElement("p");
  hint.className = "field-hint";
  hint.textContent = help;
  field.append(lab, select, hint);
  return field;
}

function toggleField(
  label: string,
  key: keyof Settings,
  value: boolean,
  help?: string,
): HTMLElement {
  const field = document.createElement("div");
  field.className = "field field--toggle";
  const labelEl = document.createElement("label");
  labelEl.className = "field-label";
  const text = document.createElement("span");
  text.textContent = label;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "switch" + (value ? " is-on" : "");
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", String(value));
  toggle.dataset.setting = String(key);
  const knob = document.createElement("span");
  knob.className = "switch-knob";
  toggle.append(knob);
  toggle.addEventListener("click", () => {
    const next = toggle.classList.toggle("is-on");
    toggle.setAttribute("aria-checked", String(next));
    persistSetting(key, next);
  });
  labelEl.append(text, toggle);
  field.append(labelEl);
  if (help) {
    const hint = document.createElement("p");
    hint.className = "field-hint";
    hint.textContent = help;
    field.append(hint);
  }
  return field;
}

function selectField(
  label: string,
  key: keyof Settings,
  options: string[],
  value: string,
): HTMLElement {
  const field = document.createElement("div");
  field.className = "field";
  const lab = document.createElement("label");
  lab.className = "field-label";
  lab.textContent = label;
  const select = document.createElement("select");
  select.dataset.setting = String(key);
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    if (opt === value) o.selected = true;
    select.append(o);
  }
  select.addEventListener("change", () => persistSetting(key, select.value));
  field.append(lab, select);
  return field;
}

async function persistSetting(
  key: keyof Settings,
  value: unknown,
): Promise<void> {
  const next = await window.soundgrid.setSettings({
    [key]: value,
  } as Partial<Settings>);
  store.update({ settings: next });
}
