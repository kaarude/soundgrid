import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc.js";
import { Settings, SoundClip } from "../shared/types.js";

// ---------------------------------------------------------------------------
// Preload bridge
//
// Exposes a single, typed `soundgrid` object on the renderer's `window`.
// The renderer never touches Node/Electron APIs directly (contextIsolation
// is on, nodeIntegration is off, sandbox is on).
// ---------------------------------------------------------------------------

export interface SoundGridApi {
  // library
  getLibrary: () => Promise<SoundClip[]>;
  importFiles: (paths: string[]) => Promise<SoundClip[]>;
  removeClip: (id: string) => Promise<void>;
  updateClip: (id: string, patch: Partial<SoundClip>) => Promise<void>;

  // settings
  getSettings: () => Promise<Settings>;
  setSettings: (patch: Partial<Settings>) => Promise<Settings>;

  // devices (from renderer, since Electron main can't enumerate them)
  listDevices: () => Promise<unknown>;
  pushDevices: (devices: unknown) => Promise<unknown>;

  // mic transport
  micPlay: (clipId: string) => Promise<void>;
  micPause: () => Promise<void>;
  micResume: () => Promise<void>;
  micStop: () => Promise<void>;
  micStopAll: () => Promise<void>;
  micSetMute: (muted: boolean) => Promise<void>;
  micSetVolume: (v: number) => Promise<void>;

  // monitor transport
  monitorPlay: (clipId: string) => Promise<void>;
  monitorPause: () => Promise<void>;
  monitorStop: () => Promise<void>;
  monitorSetVolume: (v: number) => Promise<void>;

  // hotkeys
  registerHotkeys: (bindings: { id: string; keys: string }[]) => Promise<void>;
  unregisterHotkeys: () => Promise<void>;

  // dialog helpers
  pickAudioFiles: () => Promise<string[]>;
}

contextBridge.exposeInMainWorld("soundgrid", {
  getLibrary: () => ipcRenderer.invoke(IPC.LIBRARY_GET),
  importFiles: (paths: string[]) =>
    ipcRenderer.invoke(IPC.LIBRARY_IMPORT, paths),
  removeClip: (id: string) => ipcRenderer.invoke(IPC.LIBRARY_REMOVE, id),
  updateClip: (id: string, patch: Partial<SoundClip>) =>
    ipcRenderer.invoke(IPC.LIBRARY_UPDATE_CLIP, id, patch),

  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (patch: Partial<Settings>) =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, patch),

  listDevices: () => ipcRenderer.invoke(IPC.DEVICES_LIST),
  pushDevices: (devices: unknown) =>
    ipcRenderer.invoke(IPC.DEVICES_REFRESH, devices),

  micPlay: (clipId: string) => ipcRenderer.invoke(IPC.MIC_PLAY, clipId),
  micPause: () => ipcRenderer.invoke(IPC.MIC_PAUSE),
  micResume: () => ipcRenderer.invoke(IPC.MIC_RESUME),
  micStop: () => ipcRenderer.invoke(IPC.MIC_STOP),
  micStopAll: () => ipcRenderer.invoke(IPC.MIC_STOP_ALL),
  micSetMute: (muted: boolean) => ipcRenderer.invoke(IPC.MIC_SET_MUTE, muted),
  micSetVolume: (v: number) => ipcRenderer.invoke(IPC.MIC_SET_VOLUME, v),

  monitorPlay: (clipId: string) => ipcRenderer.invoke(IPC.MONITOR_PLAY, clipId),
  monitorPause: () => ipcRenderer.invoke(IPC.MONITOR_PAUSE),
  monitorStop: () => ipcRenderer.invoke(IPC.MONITOR_STOP),
  monitorSetVolume: (v: number) =>
    ipcRenderer.invoke(IPC.MONITOR_SET_VOLUME, v),

  registerHotkeys: (bindings: { id: string; keys: string }[]) =>
    ipcRenderer.invoke(IPC.HOTKEYS_REGISTER, bindings),
  unregisterHotkeys: () => ipcRenderer.invoke(IPC.HOTKEYS_UNREGISTER),

  pickAudioFiles: () => ipcRenderer.invoke("dialog:openAudio"),
} satisfies SoundGridApi);
