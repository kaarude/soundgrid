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
  window.soundgrid.onAudioEvent((event) => {
    if (event.type === "meter") {
      store.update({ micLevel: event.mic, monitorLevel: event.monitor });
    } else if (event.type === "clipEnded") {
      if (event.bus === "mic" && store.state.micPlaying?.clipId === event.clipId) {
        store.update({ micPlaying: null });
      } else if (
        event.bus === "monitor" &&
        store.state.monitorPlaying?.clipId === event.clipId
      ) {
        store.update({ monitorPlaying: null });
      }
    } else if (event.type === "transport") {
      const key = event.bus === "mic" ? "micPlaying" : "monitorPlaying";
      const current = store.state[key];
      store.update({
        [key]:
          event.state === "stopped"
            ? null
            : event.clipId && event.name
              ? {
                  clipId: event.clipId,
                  name: event.name,
                  paused: event.state === "paused",
                }
              : current
                ? { ...current, paused: event.state === "paused" }
                : null,
      });
    } else if (event.type === "mute") {
      store.update(
        event.bus === "mic"
          ? { micMuted: event.muted }
          : { monitorMuted: event.muted },
      );
    } else if (event.type === "error") {
      console.error("Audio engine:", event.message);
      store.update({ audioError: event.message });
    }
  });
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
  try {
    store.update({ cableStatus: await window.soundgrid.getCableStatus() });
  } catch (error) {
    console.error("Could not check VB-CABLE:", error);
  }
}

async function refreshDevices(): Promise<void> {
  try {
    const native = await window.soundgrid.listDevices();
    if (native.micOutputs.length || native.monitors.length || native.realMics.length) {
      store.update({ devicesStatus: "ready", devices: native });
      return;
    }

    // Browser fallback keeps UI development usable when the native sidecar
    // has not been compiled for the current platform.
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
