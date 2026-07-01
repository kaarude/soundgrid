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
  Settings,
  SoundClip,
  SoundClipPatch,
  HotkeyRegistrationResult,
} from "../shared/types.js";
import { LibraryStore } from "./library.js";
import { SettingsStore } from "./settings.js";
import { AudioEngine } from "./audio-engine.js";
import { DeviceManager } from "./devices.js";
import { HotkeyManager } from "./hotkeys.js";
import { DriverManager } from "./driver-manager.js";

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

  async start() {
    await app.whenReady();

    const userDataDir = app.getPath("userData");
    const soundsDir = path.join(userDataDir, "sounds");
    await fs.mkdir(soundsDir, { recursive: true });

    await this.library.init(path.join(userDataDir, "library.json"), soundsDir);
    await this.settings.init(path.join(userDataDir, "settings.json"));

    this.audio.onEvent((event) => this.onAudioEvent(event));
    await this.audio.start(this.settings.get());

    this.registerIpc();
    this.registerPersistedHotkeys();
    this.createWindow();
    this.createTray();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
    });
    app.on("before-quit", () => {
      this.quitting = true;
      this.audio.shutdown();
    });
  }

  private createWindow() {
    this.win = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 820,
      minHeight: 560,
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

    const devUrl = process.env.VITE_DEV_SERVER_URL;
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

  private createTray() {
    const icon = nativeImage.createEmpty();
    this.tray = new Tray(icon);
    this.tray.setToolTip("SoundGrid");
    this.tray.on("click", () => this.win?.show());
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open SoundGrid", click: () => this.win?.show() },
        {
          label: "Stop all sounds",
          click: () => this.audio.stopAll(),
        },
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
    ipcMain.handle(IPC.LIBRARY_IMPORT, async (_e, filePaths: string[]) => {
      const added = await this.library.importFiles(filePaths);
      return added;
    });
    ipcMain.handle(IPC.LIBRARY_REMOVE, async (_e, id: string) => {
      await this.library.removeClip(id);
      this.registerPersistedHotkeys();
    });
    ipcMain.handle(
      IPC.LIBRARY_UPDATE_CLIP,
      async (_e, id: string, patch: SoundClipPatch) => {
        const previousHotkey = this.library.byId(id)?.hotkey;
        const clip = await this.library.updateClip(id, patch);
        const hotkeys = this.registerPersistedHotkeys();
        const failed = hotkeys.failures.some((item) => item.id === id);
        if (failed && Object.prototype.hasOwnProperty.call(patch, "hotkey")) {
          const reverted = await this.library.updateClip(id, {
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
    ipcMain.handle(IPC.SETTINGS_SET, async (_e, patch: Partial<Settings>) => {
      const next = await this.settings.set(patch);
      this.audio.applySettings(next);
      app.setLoginItemSettings({ openAtLogin: next.runOnStartup });
      this.registerPersistedHotkeys();
      return next;
    });

    // ---- Devices ----
    ipcMain.handle(IPC.DEVICES_LIST, () => this.devices.list());
    ipcMain.handle(IPC.DEVICES_REFRESH, () => this.devices.list());
    ipcMain.handle(IPC.CABLE_STATUS, () => this.driver.status());
    ipcMain.handle(IPC.CABLE_INSTALL, () => this.driver.install());
    ipcMain.handle(IPC.CABLE_DONATE, () => this.driver.openDonationPage());

    // ---- Mic transport ----
    ipcMain.handle(IPC.PLAY_BOTH, (_e, clipId: string) =>
      this.audio.playBoth(this.library.byId(clipId)),
    );
    ipcMain.handle(IPC.MIC_PLAY, (_e, clipId: string) =>
      this.audio.playToMic(this.library.byId(clipId)),
    );
    ipcMain.handle(IPC.MIC_PAUSE, () => this.audio.pauseMic());
    ipcMain.handle(IPC.MIC_RESUME, () => this.audio.resumeMic());
    ipcMain.handle(IPC.MIC_STOP, () => this.audio.stopMic());
    ipcMain.handle(IPC.MIC_STOP_ALL, () => this.audio.stopAll());
    ipcMain.handle(IPC.MIC_SET_MUTE, (_e, muted: boolean) =>
      this.audio.setMicMute(muted),
    );
    ipcMain.handle(IPC.MIC_SET_VOLUME, (_e, vol: number) =>
      this.audio.setMicVolume(vol),
    );

    // ---- Monitor transport ----
    ipcMain.handle(IPC.MONITOR_PLAY, (_e, clipId: string) =>
      this.audio.playToMonitor(this.library.byId(clipId)),
    );
    ipcMain.handle(IPC.MONITOR_PAUSE, () => this.audio.pauseMonitor());
    ipcMain.handle(IPC.MONITOR_RESUME, () => this.audio.resumeMonitor());
    ipcMain.handle(IPC.MONITOR_STOP, () => this.audio.stopMonitor());
    ipcMain.handle(IPC.MONITOR_SET_MUTE, (_e, muted: boolean) =>
      this.audio.setMonitorMute(muted),
    );
    ipcMain.handle(IPC.MONITOR_SET_VOLUME, (_e, vol: number) =>
      this.audio.setMonitorVolume(vol),
    );

    // ---- Hotkeys ----
    ipcMain.handle(
      IPC.HOTKEYS_REGISTER,
      (_e, bindings: { id: string; keys: string }[]) =>
        this.hotkeys.registerAll(bindings, (id) => {
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

    const seen = new Set<string>();
    const unique = bindings.filter((binding) => {
      const key = binding.keys.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return this.hotkeys.registerAll(unique, (id) => {
      if (id === "__stop_all__") return this.audio.stopAll();
      if (id === "__mic_mute__") return this.audio.toggleMicMute();
      return this.audio.playBoth(this.library.byId(id));
    });
  }

  private onAudioEvent(event: AudioEngineEvent): void {
    this.win?.webContents.send(IPC.ON_STATE, event);
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
