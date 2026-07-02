import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  dialog,
  shell,
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { IPC } from "../shared/ipc.js";
import {
  AudioEngineEvent,
  HotkeyRegistrationResult,
  UpdateState,
} from "../shared/types.js";
import { LibraryStore } from "./library.js";
import { SettingsStore } from "./settings.js";
import { AudioEngine } from "./audio-engine.js";
import { DeviceManager } from "./devices.js";
import { HotkeyManager } from "./hotkeys.js";
import { DriverManager } from "./driver-manager.js";
import { autoUpdater } from "electron-updater";
import {
  requireBoolean,
  requireFiniteNumber,
  requireString,
  requireStringArray,
  validateHotkeyBindings,
  validateSettingsPatch,
  validateSoundClipPatch,
} from "./ipc-validation.js";

// The native sidecar owns decoding, WASAPI/CoreAudio streams, mixing and
// metering. On Windows, the mic bus is rendered to VB-CABLE's playback
// endpoint; voice applications capture the matching recording endpoint.

class SoundGrid {
  private win?: BrowserWindow;
  private tray?: Tray;
  private library = new LibraryStore();
  private settings = new SettingsStore();
  private audio = new AudioEngine();
  private devices = new DeviceManager(this.audio);
  private driver = new DriverManager(this.audio);
  private hotkeys = new HotkeyManager();
  private trayState = {
    micPlaying: null as string | null,
    monitorPlaying: null as string | null,
    micMuted: false,
  };
  private updateState: UpdateState = { status: "idle" };

  async start() {
    await app.whenReady();

    const userDataDir = app.getPath("userData");
    const soundsDir = path.join(userDataDir, "sounds");
    await fs.mkdir(soundsDir, { recursive: true });

    await this.library.init(path.join(userDataDir, "library.json"), soundsDir);
    this.library.watch((clips) =>
      this.win?.webContents.send(IPC.LIBRARY_CHANGED, clips),
    );
    await this.settings.init(path.join(userDataDir, "settings.json"));
    app.setLoginItemSettings({
      openAtLogin: this.settings.get().runOnStartup,
    });

    this.audio.onEvent((event) => this.onAudioEvent(event));
    await this.audio.start(this.settings.get());

    this.registerIpc();
    this.registerPersistedHotkeys();
    this.createWindow();
    this.createTray();
    this.configureUpdates();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
    });
    app.on("before-quit", () => {
      this.quitting = true;
      this.audio.shutdown();
      this.library.close();
    });
  }

  private createWindow() {
    this.win = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 640,
      minHeight: 480,
      backgroundColor: "#0d1117",
      title: "SoundGrid",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "../preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const devUrl = devServerUrl();
    if (devUrl) {
      this.win.loadURL(devUrl);
      this.win.webContents.openDevTools({ mode: "detach" });
    } else {
      this.win.loadFile(path.join(__dirname, "../renderer/index.html"));
    }

    this.win.webContents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) void shell.openExternal(url);
      return { action: "deny" };
    });

    this.win.webContents.on("will-navigate", (event, url) => {
      const current = this.win?.webContents.getURL();
      if (current && url !== current) event.preventDefault();
    });

    this.win.on("close", (e) => {
      const s = this.settings.get();
      if (s.minimizeToTray && !this.quitting) {
        e.preventDefault();
        this.win?.hide();
      }
    });
  }

  private quitting = false;

  private configureUpdates(): void {
    if (!app.isPackaged) {
      const simulatedVersion = process.env.SOUNDGRID_TEST_UPDATE_VERSION;
      this.setUpdateState(
        simulatedVersion
          ? { status: "available", version: simulatedVersion }
          : { status: "unavailable" },
      );
      return;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () =>
      this.setUpdateState({ status: "checking" }),
    );
    autoUpdater.on("update-available", (info) =>
      this.setUpdateState({ status: "available", version: info.version }),
    );
    autoUpdater.on("update-not-available", () =>
      this.setUpdateState({ status: "unavailable" }),
    );
    autoUpdater.on("download-progress", (progress) => {
      const version =
        "version" in this.updateState ? this.updateState.version : "";
      this.setUpdateState({
        status: "downloading",
        version,
        percent: Math.max(0, Math.min(100, progress.percent)),
      });
    });
    autoUpdater.on("error", (error) => {
      console.error("Automatic update failed:", error);
      this.setUpdateState({
        status: "error",
        message: "Could not check for updates. Try again later.",
      });
    });
    autoUpdater.on("update-downloaded", async (info) => {
      this.setUpdateState({ status: "downloaded", version: info.version });
      const result = await dialog.showMessageBox(this.win!, {
        type: "info",
        title: "SoundGrid update ready",
        message: `SoundGrid ${info.version} is ready to install.`,
        detail:
          "Restart now to finish the update, or install it when SoundGrid closes.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) {
        this.quitting = true;
        autoUpdater.quitAndInstall();
      }
    });
    void autoUpdater
      .checkForUpdates()
      .catch((error) => console.error("Could not check for updates:", error));
  }

  private setUpdateState(state: UpdateState): void {
    this.updateState = state;
    this.win?.webContents.send(IPC.UPDATE_STATE, state);
  }

  private createTray() {
    const iconPath = path.join(app.getAppPath(), "assets", "logo.svg");
    const loadedIcon = nativeImage.createFromPath(iconPath);
    const icon = loadedIcon.isEmpty()
      ? nativeImage.createEmpty()
      : loadedIcon.resize({ width: 16, height: 16 });
    this.tray = new Tray(icon);
    this.tray.setToolTip("SoundGrid");
    this.tray.on("click", () => this.win?.show());
    this.refreshTray();
  }

  private refreshTray(): void {
    if (!this.tray) return;
    const nowPlaying = [
      this.trayState.micPlaying ? `Mic: ${this.trayState.micPlaying}` : null,
      this.trayState.monitorPlaying
        ? `Monitor: ${this.trayState.monitorPlaying}`
        : null,
    ].filter((item): item is string => Boolean(item));
    this.tray.setToolTip(
      nowPlaying.length ? `SoundGrid — ${nowPlaying.join(" · ")}` : "SoundGrid",
    );
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open SoundGrid", click: () => this.win?.show() },
        ...(nowPlaying.length
          ? [
              { type: "separator" as const },
              ...nowPlaying.map((label) => ({ label, enabled: false })),
            ]
          : []),
        { type: "separator" },
        {
          label: this.trayState.micMuted
            ? "Unmute microphone bus"
            : "Mute microphone bus",
          type: "checkbox",
          checked: this.trayState.micMuted,
          click: () => this.audio.toggleMicMute(),
        },
        { label: "Stop all sounds", click: () => this.audio.stopAll() },
        { type: "separator" },
        {
          label: "Quit",
          click: () => {
            this.quitting = true;
            app.quit();
          },
        },
      ]),
    );
  }

  private registerIpc() {
    // ---- Library ----
    ipcMain.handle(IPC.LIBRARY_GET, () => this.library.getClips());
    ipcMain.handle(IPC.LIBRARY_IMPORT, async (_e, filePaths: unknown) => {
      const added = await this.library.importFiles(
        requireStringArray(filePaths, "filePaths"),
      );
      return added;
    });
    ipcMain.handle(IPC.LIBRARY_REMOVE, async (_e, id: unknown) => {
      const clipId = requireString(id, "clipId");
      await this.library.removeClip(clipId);
      this.registerPersistedHotkeys();
    });
    ipcMain.handle(
      IPC.LIBRARY_UPDATE_CLIP,
      async (_e, id: unknown, rawPatch: unknown) => {
        const clipId = requireString(id, "clipId");
        const patch = validateSoundClipPatch(rawPatch);
        const previousHotkey = this.library.byId(clipId)?.hotkey;
        const clip = await this.library.updateClip(clipId, patch);
        const hotkeys = this.registerPersistedHotkeys();
        const failed = hotkeys.failures.some((item) => item.id === clipId);
        if (failed && Object.prototype.hasOwnProperty.call(patch, "hotkey")) {
          const reverted = await this.library.updateClip(clipId, {
            hotkey: previousHotkey ?? null,
          });
          this.registerPersistedHotkeys();
          return { clip: reverted, hotkeys };
        }
        return { clip, hotkeys };
      },
    );

    // ---- Settings ----
    ipcMain.handle(IPC.SETTINGS_GET, () => this.settings.get());
    ipcMain.handle(IPC.SETTINGS_SET, async (_e, rawPatch: unknown) => {
      const patch = validateSettingsPatch(rawPatch);
      const previous = this.settings.get();
      const next = await this.settings.set(patch);
      this.audio.applySettings(next);
      app.setLoginItemSettings({ openAtLogin: next.runOnStartup });
      const hotkeys = this.registerPersistedHotkeys();
      const changedHotkey = Object.prototype.hasOwnProperty.call(
        patch,
        "stopAllHotkey",
      )
        ? "__stop_all__"
        : Object.prototype.hasOwnProperty.call(patch, "micMuteHotkey")
          ? "__mic_mute__"
          : null;
      if (
        changedHotkey &&
        hotkeys.failures.some((item) => item.id === changedHotkey)
      ) {
        const reverted = await this.settings.set({
          stopAllHotkey: previous.stopAllHotkey,
          micMuteHotkey: previous.micMuteHotkey,
        });
        this.registerPersistedHotkeys();
        return { settings: reverted, hotkeys };
      }
      return { settings: next, hotkeys };
    });

    // ---- Devices ----
    ipcMain.handle(IPC.DEVICES_LIST, () => this.devices.list());
    ipcMain.handle(IPC.DEVICES_REFRESH, () => this.devices.list());
    ipcMain.handle(IPC.CABLE_STATUS, () => this.driver.status());
    ipcMain.handle(IPC.CABLE_INSTALL, () => this.driver.install());
    ipcMain.handle(IPC.CABLE_DONATE, () => this.driver.openDonationPage());

    // ---- Application updates ----
    ipcMain.handle(IPC.UPDATE_GET_STATE, () => this.updateState);
    ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => {
      if (!app.isPackaged || this.updateState.status !== "available") return;
      const version = this.updateState.version;
      this.setUpdateState({ status: "downloading", version, percent: 0 });
      await autoUpdater.downloadUpdate();
    });
    ipcMain.handle(IPC.UPDATE_INSTALL, () => {
      if (!app.isPackaged || this.updateState.status !== "downloaded") return;
      this.quitting = true;
      autoUpdater.quitAndInstall();
    });

    // ---- Mic transport ----
    ipcMain.handle(IPC.PLAY_BOTH, (_e, clipId: unknown) =>
      this.audio.playBoth(this.library.byId(requireString(clipId, "clipId"))),
    );
    ipcMain.handle(IPC.MIC_PLAY, (_e, clipId: unknown) =>
      this.audio.playToMic(this.library.byId(requireString(clipId, "clipId"))),
    );
    ipcMain.handle(IPC.MIC_PAUSE, () => this.audio.pauseMic());
    ipcMain.handle(IPC.MIC_RESUME, () => this.audio.resumeMic());
    ipcMain.handle(IPC.MIC_STOP, () => this.audio.stopMic());
    ipcMain.handle(IPC.MIC_STOP_ALL, () => this.audio.stopAll());
    ipcMain.handle(IPC.MIC_SET_MUTE, (_e, muted: unknown) =>
      this.audio.setMicMute(requireBoolean(muted, "muted")),
    );
    ipcMain.handle(IPC.MIC_SET_VOLUME, (_e, vol: unknown) =>
      this.audio.setMicVolume(requireFiniteNumber(vol, "volume")),
    );

    // ---- Monitor transport ----
    ipcMain.handle(IPC.MONITOR_PLAY, (_e, clipId: unknown) =>
      this.audio.playToMonitor(
        this.library.byId(requireString(clipId, "clipId")),
      ),
    );
    ipcMain.handle(IPC.MONITOR_PAUSE, () => this.audio.pauseMonitor());
    ipcMain.handle(IPC.MONITOR_RESUME, () => this.audio.resumeMonitor());
    ipcMain.handle(IPC.MONITOR_STOP, () => this.audio.stopMonitor());
    ipcMain.handle(IPC.MONITOR_SET_MUTE, (_e, muted: unknown) =>
      this.audio.setMonitorMute(requireBoolean(muted, "muted")),
    );
    ipcMain.handle(IPC.MONITOR_SET_VOLUME, (_e, vol: unknown) =>
      this.audio.setMonitorVolume(requireFiniteNumber(vol, "volume")),
    );

    // ---- Hotkeys ----
    ipcMain.handle(IPC.HOTKEYS_REGISTER, (_e, bindings: unknown) =>
      this.hotkeys.registerAll(validateHotkeyBindings(bindings), (id) => {
        if (id === "__stop_all__") return this.audio.stopAll();
        if (id === "__mic_mute__") return this.audio.toggleMicMute();
        return this.audio.playBoth(this.library.byId(id));
      }),
    );
    ipcMain.handle(IPC.HOTKEYS_UNREGISTER, () => this.hotkeys.unregisterAll());

    // ---- File dialog ----
    ipcMain.handle("dialog:openAudio", async () => {
      const result = await dialog.showOpenDialog({
        title: "Import audio into SoundGrid",
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "Audio",
            extensions: [
              "aif",
              "aiff",
              "mp3",
              "wav",
              "ogg",
              "oga",
              "flac",
              "m4a",
              "aac",
              "opus",
              "webm",
              "caf",
              "mp4",
            ],
          },
        ],
      });
      if (result.canceled) return [];
      return result.filePaths;
    });
  }

  private registerPersistedHotkeys(): HotkeyRegistrationResult {
    const settings = this.settings.get();
    const bindings = [
      settings.stopAllHotkey
        ? { id: "__stop_all__", keys: settings.stopAllHotkey }
        : null,
      settings.micMuteHotkey
        ? { id: "__mic_mute__", keys: settings.micMuteHotkey }
        : null,
      ...this.library
        .getClips()
        .filter((clip) => clip.hotkey)
        .map((clip) => ({ id: clip.id, keys: clip.hotkey as string })),
    ].filter((binding): binding is { id: string; keys: string } =>
      Boolean(binding),
    );

    return this.hotkeys.registerAll(bindings, (id) => {
      if (id === "__stop_all__") return this.audio.stopAll();
      if (id === "__mic_mute__") return this.audio.toggleMicMute();
      return this.audio.playBoth(this.library.byId(id));
    });
  }

  private onAudioEvent(event: AudioEngineEvent): void {
    this.win?.webContents.send(IPC.ON_STATE, event);
    if (event.type === "transport") {
      const key = event.bus === "mic" ? "micPlaying" : "monitorPlaying";
      if (event.state === "stopped") this.trayState[key] = null;
      else if (event.name) this.trayState[key] = event.name;
      this.refreshTray();
    } else if (event.type === "clipEnded") {
      const key = event.bus === "mic" ? "micPlaying" : "monitorPlaying";
      this.trayState[key] = null;
      this.refreshTray();
    } else if (event.type === "mute" && event.bus === "mic") {
      this.trayState.micMuted = event.muted;
      this.refreshTray();
    }
    if (event.type === "error") console.error("Audio engine:", event.message);
  }
}

new SoundGrid().start().catch((err) => {
  console.error("SoundGrid failed to start:", err);
  app.quit();
});

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function devServerUrl(): string | undefined {
  if (app.isPackaged) return undefined;
  const value = process.env.VITE_DEV_SERVER_URL;
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    const hostAllowed =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1";
    if (parsed.protocol === "http:" && hostAllowed && parsed.port === "5173") {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}
