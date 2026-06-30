import { store } from "./store";
import { Sidebar, syncSidebar } from "./Sidebar";
import { ClipGrid, syncClipGrid } from "./ClipGrid";
import { SettingsDrawer, syncSettingsDrawer } from "./SettingsDrawer";
import { TopBar, syncTopBar } from "./TopBar";
import { syncBusMeter } from "./BusMeter";

// SoundGrid main window — "The Cue Rack":
//   top bus transport · collapsible cue rail · center clip grid.
// All state flows through the tiny reactive store; components re-sync on change.

export function App(): HTMLElement {
  const el = document.createElement("div");
  el.className = "app";

  const body = document.createElement("div");
  body.className = "body";
  body.append(Sidebar(), ClipGrid());

  el.append(TopBar(), body, SettingsDrawer());

  // subscribe once; re-sync the pieces that changed
  store.subscribe(() => {
    syncSidebar();
    syncClipGrid();
    syncTopBar();
    syncBusMeter("mic");
    syncBusMeter("monitor");
    syncSettingsDrawer();
  });

  // initial load
  void boot();
  return el;
}

async function boot(): Promise<void> {
  const [clips, settings] = await Promise.all([
    window.soundgrid.getLibrary(),
    window.soundgrid.getSettings(),
  ]);
  store.update({
    clips,
    settings,
    micVolume: settings.masterMicVolume,
    monitorVolume: settings.monitorVolume,
  });

  // device enumeration: the main process can't list audio devices, so the
  // renderer queries the Web Audio / MediaDevices API and surfaces them.
  await refreshDevices();
}

async function refreshDevices(): Promise<void> {
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    const outs = list.filter((d) => d.kind === "audiooutput");
    const ins = list.filter((d) => d.kind === "audioinput");
    const label = (d: MediaDeviceInfo) =>
      d.label || `Device ${d.deviceId.slice(0, 6)}`;
    store.update({
      devicesStatus: "ready",
      devices: {
        micOutputs: outs.map((d) => ({ id: d.deviceId, label: label(d) })),
        monitors: outs.map((d) => ({ id: d.deviceId, label: label(d) })),
        realMics: ins.map((d) => ({ id: d.deviceId, label: label(d) })),
      },
    });
  } catch (error) {
    store.update({
      devicesStatus:
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "permission-needed"
          : "error",
    });
  }
  // labels are empty until permission: re-enumerate after a user gesture later.
}

// Re-enumerate device labels once a mic permission gesture happens anywhere.
navigator.mediaDevices.addEventListener?.(
  "devicechange",
  () => void refreshDevices(),
);
document.addEventListener("click", () => void refreshDevices(), { once: true });
