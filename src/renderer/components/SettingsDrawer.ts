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
  panel.tabIndex = -1;

  const head = document.createElement("div");
  head.className = "drawer-head";
  const title = document.createElement("h2");
  title.textContent = "Settings";
  const headActions = document.createElement("div");
  headActions.className = "drawer-head-actions";
  const saveStatus = document.createElement("span");
  saveStatus.className = "drawer-save-status";
  saveStatus.setAttribute("role", "status");
  saveStatus.setAttribute("aria-live", "polite");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn";
  close.title = "Close";
  close.setAttribute("aria-label", "Close settings");
  close.append(icon.close());
  close.addEventListener("click", () => store.update({ settingsOpen: false }));
  headActions.append(saveStatus, close);
  head.append(title, headActions);

  const body = document.createElement("div");
  body.className = "drawer-body";

  panel.append(head, body);
  el.append(panel);

  el.addEventListener("click", (e) => {
    if (e.target === el) store.update({ settingsOpen: false });
  });
  el.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      store.update({ settingsOpen: false });
      return;
    }
    if (event.key === "Tab") trapFocus(panel, event);
  });
  return el;
}

let settingsWasOpen = false;
let settingsTrigger: HTMLElement | null = null;

export function syncSettingsDrawer(): void {
  const overlay = document.querySelector<HTMLElement>(".drawer-overlay");
  if (!overlay) return;
  const opening = store.state.settingsOpen && !settingsWasOpen;
  const closing = !store.state.settingsOpen && settingsWasOpen;
  if (opening) {
    const active = document.activeElement as HTMLElement | null;
    settingsTrigger =
      active && active !== document.body
        ? active
        : document.querySelector<HTMLElement>('[aria-label="Open settings"]');
  }
  overlay.hidden = !store.state.settingsOpen;
  if (!overlay.hidden) {
    renderSettingsBody();
    if (opening) {
      document.body.classList.add("has-modal-open");
      requestAnimationFrame(() =>
        overlay.querySelector<HTMLElement>(".drawer")?.focus(),
      );
    }
  }
  if (closing) {
    document.body.classList.remove("has-modal-open");
    settingsTrigger?.focus();
    settingsTrigger = null;
  }
  settingsWasOpen = store.state.settingsOpen;
}

// ---- field builders ----
function renderSettingsBody(): void {
  const body = document.querySelector<HTMLElement>(".drawer-body");
  if (!body) return;

  const signature = JSON.stringify({
    settings: store.state.settings,
    devices: store.state.devices,
    devicesStatus: store.state.devicesStatus,
    cableStatus: store.state.cableStatus,
    cableInstalling: store.state.cableInstalling,
  });
  if (body.dataset.signature === signature) return;
  body.dataset.signature = signature;

  const s = store.state.settings;
  const d = store.state.devices;

  const routing = group("Routing");
  routing.append(deviceSummary());
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

  const behavior = group("Behavior");
  const listeningMode = document.createElement("p");
  listeningMode.className = "group-note";
  listeningMode.textContent =
    "Choose one local listening mode. Mic-only turns headset-only off automatically.";
  behavior.append(
    listeningMode,
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

  const system = group("System");
  system.append(
    toggleField("Run on startup", "runOnStartup", s.runOnStartup),
    toggleField("Minimize to tray", "minimizeToTray", s.minimizeToTray),
    toggleField("Auto-select mic", "autoSelectMic", s.autoSelectMic),
    selectField("Theme", "theme", ["dark", "light", "system"], s.theme),
  );

  const driver = group("Driver");
  driver.classList.add("drawer-group--driver");
  driver.append(cableInstaller());

  body.replaceChildren(routing, behavior, system, driver);
}

function cableInstaller(): HTMLElement {
  const status = store.state.cableStatus;
  const panel = document.createElement("div");
  panel.className = `cable-setup${status?.installed ? " is-ready" : ""}`;

  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "VB-CABLE";
  const description = document.createElement("p");
  description.textContent =
    status?.message ?? "Checking whether the virtual audio cable is installed…";
  copy.append(title, description);

  const actions = document.createElement("div");
  actions.className = "cable-actions";
  if (status?.supported && !status.installed) {
    const install = document.createElement("button");
    install.type = "button";
    install.className = "settings-action settings-action--primary";
    install.disabled = !status.canInstall || store.state.cableInstalling;
    install.textContent = store.state.cableInstalling ? "Installing…" : "Install VB-CABLE";
    install.addEventListener("click", () => void installCable());
    actions.append(install);
  }
  const donate = document.createElement("button");
  donate.type = "button";
  donate.className = "settings-action";
  donate.textContent = "VB-Audio donation page";
  donate.addEventListener("click", () => void window.soundgrid.openCableDonation());
  actions.append(donate);

  const attribution = document.createElement("p");
  attribution.className = "cable-attribution";
  attribution.textContent =
    "VB-CABLE is separate donationware by VB-Audio Software. All participation is welcome.";
  panel.append(copy, actions, attribution);
  return panel;
}

async function installCable(): Promise<void> {
  store.update({ cableInstalling: true });
  try {
    const status = await window.soundgrid.installCable();
    store.update({ cableStatus: status, cableInstalling: false });
  } catch (error) {
    store.update({
      cableInstalling: false,
      audioError: error instanceof Error ? error.message : "VB-CABLE installation failed.",
    });
  }
}

function group(title: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "drawer-group";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  return section;
}

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
  select.id = `setting-${String(key)}`;
  lab.htmlFor = select.id;
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
  const selectedExists =
    !selected || devices.some((device) => device.id === selected);
  const valid = Boolean(selected && selectedExists);
  field.classList.toggle("is-valid", valid);
  field.classList.toggle("is-error", Boolean(selected && !selectedExists));
  const hint = document.createElement("p");
  hint.className = "field-hint";
  hint.textContent =
    selected && !selectedExists
      ? "The saved device is unavailable. Reconnect it or choose another device."
      : devices.length === 0
        ? "No devices are available. Check system audio permissions, then reconnect or refresh your device."
        : valid
          ? `Connected. ${help}`
          : `Select a device. ${help}`;
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
  toggle.setAttribute("aria-label", label);
  toggle.dataset.setting = String(key);
  const knob = document.createElement("span");
  knob.className = "switch-knob";
  toggle.append(knob);
  toggle.addEventListener("click", () => {
    const next = toggle.classList.toggle("is-on");
    toggle.setAttribute("aria-checked", String(next));
    if (next && key === "micOnly") {
      void persistSettings({ micOnly: true, headsetOnly: false });
    } else if (next && key === "headsetOnly") {
      void persistSettings({ headsetOnly: true, micOnly: false });
    } else {
      void persistSetting(key, next);
    }
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
  select.id = `setting-${String(key)}`;
  lab.htmlFor = select.id;
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
  await persistSettings({ [key]: value } as Partial<Settings>);
}

async function persistSettings(patch: Partial<Settings>): Promise<void> {
  setSaveStatus("saving", "Saving…");
  try {
    const next = await window.soundgrid.setSettings(patch);
    store.update({ settings: next });
    setSaveStatus("saved", "Saved");
  } catch {
    setSaveStatus("error", "Could not save. Try again.");
  }
}

function deviceSummary(): HTMLElement {
  const summary = document.createElement("div");
  const { settings, devices, devicesStatus } = store.state;
  const routeIsAvailable = (selected: string | null, list: AudioDevice[]) =>
    Boolean(selected && list.some((device) => device.id === selected));
  const routingComplete =
    routeIsAvailable(settings.micOutputDeviceId, devices.micOutputs) &&
    routeIsAvailable(settings.monitorDeviceId, devices.monitors) &&
    (!settings.passthrough ||
      routeIsAvailable(settings.realMicDeviceId, devices.realMics));
  const visualStatus =
    devicesStatus === "ready" && !routingComplete ? "error" : devicesStatus;
  summary.className = `routing-status routing-status--${visualStatus}`;
  const copy: Record<typeof store.state.devicesStatus, string> = {
    loading: "Checking audio devices…",
    ready: "Audio devices detected. Confirm both routes before broadcasting.",
    "permission-needed":
      "Audio permission is required to identify devices. Check system permissions, then reopen Settings.",
    error:
      "Audio devices could not be read. Check your system audio service and reopen Settings.",
  };
  summary.textContent =
    devicesStatus === "ready" && !routingComplete
      ? "Routing is incomplete. Select an available mic output and monitor before broadcasting."
      : copy[devicesStatus];
  summary.setAttribute("role", visualStatus === "error" ? "alert" : "status");
  return summary;
}

function setSaveStatus(
  state: "saving" | "saved" | "error",
  text: string,
): void {
  const status = document.querySelector<HTMLElement>(".drawer-save-status");
  if (!status) return;
  status.dataset.state = state;
  status.textContent = text;
}

function trapFocus(panel: HTMLElement, event: KeyboardEvent): void {
  const focusable = [
    ...panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
