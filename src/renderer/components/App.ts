import { store } from "./store";
import { Sidebar, syncSidebar } from "./Sidebar";
import { ClipGrid, syncClipGrid } from "./ClipGrid";
import { SettingsDrawer, syncSettingsDrawer } from "./SettingsDrawer";
import { TopBar, syncTopBar } from "./TopBar";
import { syncBusMeter } from "./BusMeter";
import { importDroppedAudioFiles } from "./library-actions";
import { reconcileAudioRouting } from "../../shared/routing";
import { AudioDevices, Settings } from "../../shared/types";

// SoundGrid main window — "The Cue Rack":
//   top bus transport · collapsible cue rail · center clip grid.
// All state flows through the tiny reactive store; components re-sync on change.

export function App(): HTMLElement {
  const el = document.createElement("div");
  el.className = "app";

  const body = document.createElement("div");
  body.className = "body";
  body.append(Sidebar(), ClipGrid());

  const status = document.createElement("div");
  status.className = "system-alert";
  status.hidden = true;
  status.setAttribute("role", "alert");
  const statusText = document.createElement("span");
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => store.update({ audioError: null }));
  status.append(statusText, dismiss);

  el.append(TopBar(), status, body, SettingsDrawer());
  installFileDrop(el);

  // subscribe once; re-sync the pieces that changed
  store.subscribe(() => {
    syncSidebar();
    syncClipGrid();
    syncTopBar();
    syncBusMeter("mic");
    syncBusMeter("monitor");
    syncSettingsDrawer();
    syncSystemState(status, statusText);
  });

  // initial load
  window.soundgrid.onAudioEvent((event) => {
    if (event.type === "meter") {
      store.update({ micLevel: event.mic, monitorLevel: event.monitor });
    } else if (event.type === "clipEnded") {
      if (
        event.bus === "mic" &&
        store.state.micPlaying?.clipId === event.clipId
      ) {
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
  window.soundgrid.onLibraryChanged((clips) => store.update({ clips }));
  window.soundgrid.onUpdateState((updateState) =>
    store.update({ updateState }),
  );
  void window.soundgrid
    .getUpdateState()
    .then((updateState) => store.update({ updateState }));
  void boot();
  return el;
}

function installFileDrop(app: HTMLElement): void {
  const overlay = document.createElement("div");
  overlay.className = "drop-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML =
    '<div class="drop-overlay-content"><strong>Drop audio to import</strong><span>Files keep their exact filenames</span></div>';
  app.append(overlay);

  let dragDepth = 0;
  const hasFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  app.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    app.classList.add("is-file-dragging");
  });
  app.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  app.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) app.classList.remove("is-file-dragging");
  });
  app.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    app.classList.remove("is-file-dragging");
    if (event.dataTransfer?.files.length) {
      void importDroppedAudioFiles(event.dataTransfer.files);
    }
  });
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

  applyTheme(settings.theme);

  // device enumeration: the main process can't list audio devices, so the
  // renderer queries the Web Audio / MediaDevices API and surfaces them.
  const devices = await refreshDevices();
  if (devices) await syncRoutingWithDevices(devices, settings);
  try {
    store.update({ cableStatus: await window.soundgrid.getCableStatus() });
  } catch (error) {
    console.error("Could not check the virtual audio cable:", error);
  }
}

async function refreshDevices(): Promise<AudioDevices | null> {
  try {
    const native = await window.soundgrid.listDevices();
    store.update({ devicesStatus: "ready", devices: native });
    return native;
  } catch (error) {
    store.update({
      devicesStatus:
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "permission-needed"
          : "error",
    });
  }
  return null;
}

async function syncRoutingWithDevices(
  devices: AudioDevices,
  settings: Settings,
): Promise<void> {
  const patch = reconcileAudioRouting(settings, devices);
  if (!Object.keys(patch).length) return;
  const result = await window.soundgrid.setSettings(patch);
  store.update({ settings: result.settings });
}

function applyTheme(theme: "dark" | "light" | "system"): void {
  document.documentElement.dataset.theme = theme;
}

function syncSystemState(alert: HTMLElement, text: HTMLElement): void {
  applyTheme(store.state.settings.theme);
  alert.hidden = !store.state.audioError;
  text.textContent = store.state.audioError ?? "";
}
