import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC } from "../shared/ipc.js";
import {
  AudioDevices,
  AudioEngineEvent,
  BulkClipPatch,
  CableStatus,
  HotkeyRegistrationResult,
  LibraryImportResult,
  Settings,
  SettingsUpdateResult,
  SoundClip,
  SoundClipPatch,
  SoundClipUpdateResult,
  UpdateState,
} from "../shared/types.js";

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
  importFiles: (paths: string[]) => Promise<LibraryImportResult>;
  removeClip: (id: string) => Promise<void>;
  updateClip: (
    id: string,
    patch: SoundClipPatch,
  ) => Promise<SoundClipUpdateResult>;
  updateClips: (ids: string[], patch: BulkClipPatch) => Promise<SoundClip[]>;
  rescanLibrary: () => Promise<SoundClip[]>;
  onLibraryChanged: (handler: (clips: SoundClip[]) => void) => () => void;

  // settings
  getSettings: () => Promise<Settings>;
  setSettings: (patch: Partial<Settings>) => Promise<SettingsUpdateResult>;

  // devices + native engine events
  listDevices: () => Promise<AudioDevices>;
  onAudioEvent: (handler: (event: AudioEngineEvent) => void) => () => void;
  getCableStatus: () => Promise<CableStatus>;
  installCable: () => Promise<CableStatus>;
  openCableDonation: () => Promise<void>;

  // application updates
  getUpdateState: () => Promise<UpdateState>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateState: (handler: (state: UpdateState) => void) => () => void;

  // mic transport
  playBoth: (clipId: string) => Promise<void>;
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
  monitorResume: () => Promise<void>;
  monitorStop: () => Promise<void>;
  monitorSetMute: (muted: boolean) => Promise<void>;
  monitorSetVolume: (v: number) => Promise<void>;

  // hotkeys
  registerHotkeys: (
    bindings: { id: string; keys: string }[],
  ) => Promise<HotkeyRegistrationResult>;
  unregisterHotkeys: () => Promise<void>;

  // dialog helpers
  pickAudioFiles: () => Promise<string[]>;
  getPathForFile: (file: File) => string;
}

contextBridge.exposeInMainWorld("soundgrid", {
  getLibrary: () => ipcRenderer.invoke(IPC.LIBRARY_GET),
  importFiles: (paths: string[]) =>
    ipcRenderer.invoke(IPC.LIBRARY_IMPORT, paths),
  removeClip: (id: string) => ipcRenderer.invoke(IPC.LIBRARY_REMOVE, id),
  updateClip: (id: string, patch: SoundClipPatch) =>
    ipcRenderer.invoke(IPC.LIBRARY_UPDATE_CLIP, id, patch),
  updateClips: (ids: string[], patch: BulkClipPatch) =>
    ipcRenderer.invoke(IPC.LIBRARY_UPDATE_CLIPS, ids, patch),
  rescanLibrary: () => ipcRenderer.invoke(IPC.LIBRARY_RESCAN),
  onLibraryChanged: (handler: (clips: SoundClip[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, clips: SoundClip[]) =>
      handler(clips);
    ipcRenderer.on(IPC.LIBRARY_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC.LIBRARY_CHANGED, listener);
  },

  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (patch: Partial<Settings>) =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, patch),

  listDevices: () => ipcRenderer.invoke(IPC.DEVICES_LIST),
  onAudioEvent: (handler: (event: AudioEngineEvent) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: AudioEngineEvent,
    ) => handler(payload);
    ipcRenderer.on(IPC.ON_STATE, listener);
    return () => ipcRenderer.removeListener(IPC.ON_STATE, listener);
  },
  getCableStatus: () => ipcRenderer.invoke(IPC.CABLE_STATUS),
  installCable: () => ipcRenderer.invoke(IPC.CABLE_INSTALL),
  openCableDonation: () => ipcRenderer.invoke(IPC.CABLE_DONATE),

  getUpdateState: () => ipcRenderer.invoke(IPC.UPDATE_GET_STATE),
  downloadUpdate: () => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  onUpdateState: (handler: (state: UpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState) =>
      handler(state);
    ipcRenderer.on(IPC.UPDATE_STATE, listener);
    return () => ipcRenderer.removeListener(IPC.UPDATE_STATE, listener);
  },

  playBoth: (clipId: string) => ipcRenderer.invoke(IPC.PLAY_BOTH, clipId),
  micPlay: (clipId: string) => ipcRenderer.invoke(IPC.MIC_PLAY, clipId),
  micPause: () => ipcRenderer.invoke(IPC.MIC_PAUSE),
  micResume: () => ipcRenderer.invoke(IPC.MIC_RESUME),
  micStop: () => ipcRenderer.invoke(IPC.MIC_STOP),
  micStopAll: () => ipcRenderer.invoke(IPC.MIC_STOP_ALL),
  micSetMute: (muted: boolean) => ipcRenderer.invoke(IPC.MIC_SET_MUTE, muted),
  micSetVolume: (v: number) => ipcRenderer.invoke(IPC.MIC_SET_VOLUME, v),

  monitorPlay: (clipId: string) => ipcRenderer.invoke(IPC.MONITOR_PLAY, clipId),
  monitorPause: () => ipcRenderer.invoke(IPC.MONITOR_PAUSE),
  monitorResume: () => ipcRenderer.invoke(IPC.MONITOR_RESUME),
  monitorStop: () => ipcRenderer.invoke(IPC.MONITOR_STOP),
  monitorSetMute: (muted: boolean) =>
    ipcRenderer.invoke(IPC.MONITOR_SET_MUTE, muted),
  monitorSetVolume: (v: number) =>
    ipcRenderer.invoke(IPC.MONITOR_SET_VOLUME, v),

  registerHotkeys: (bindings: { id: string; keys: string }[]) =>
    ipcRenderer.invoke(IPC.HOTKEYS_REGISTER, bindings),
  unregisterHotkeys: () => ipcRenderer.invoke(IPC.HOTKEYS_UNREGISTER),

  pickAudioFiles: () => ipcRenderer.invoke("dialog:openAudio"),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
} satisfies SoundGridApi);
