import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  dialog,
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { IPC } from "../shared/ipc.js";
import { DEFAULT_SETTINGS, Settings, SoundClip } from "../shared/types.js";
import { LibraryStore } from "./library.js";
import { SettingsStore } from "./settings.js";
import { AudioEngine } from "./audio-engine.js";
import { DeviceManager } from "./devices.js";
import { HotkeyManager } from "./hotkeys.js";

// Windows driver note: real "mic injection" requires a virtual audio device
// (e.g. VB-CABLE). SoundGrid cannot ship a signed kernel driver as an
// open-source project, so on first run we detect a virtual cable and guide
// the user to install one. The audio engine routes the mic bus to whatever
// playback device the user selects as their "mic output".

class SoundGrid {
  private win?: BrowserWindow;
  private tray?: Tray;
  private library = new LibraryStore();
  private settings = new SettingsStore();
  private audio = new AudioEngine();
  private devices = new DeviceManager();
  private hotkeys = new HotkeyManager();

  async start() {
    await app.whenReady();

    const userDataDir = app.getPath("userData");
    const soundsDir = path.join(userDataDir, "sounds");
    await fs.mkdir(soundsDir, { recursive: true });

    await this.library.init(path.join(userDataDir, "library.json"), soundsDir);
    await this.settings.init(path.join(userDataDir, "settings.json"));

    this.registerIpc();
    this.createWindow();
    this.createTray();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
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
    ipcMain.handle(IPC.LIBRARY_REMOVE, (_e, id: string) =>
      this.library.removeClip(id),
    );
    ipcMain.handle(
      IPC.LIBRARY_UPDATE_CLIP,
      (_e, id: string, patch: Partial<SoundClip>) =>
        this.library.updateClip(id, patch),
    );

    // ---- Settings ----
    ipcMain.handle(IPC.SETTINGS_GET, () => this.settings.get());
    ipcMain.handle(IPC.SETTINGS_SET, (_e, patch: Partial<Settings>) =>
      this.settings.set(patch),
    );

    // ---- Devices ----
    ipcMain.handle(IPC.DEVICES_LIST, () => this.devices.list());
    ipcMain.handle(IPC.DEVICES_REFRESH, () => this.devices.list());

    // ---- Mic transport ----
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
    ipcMain.handle(IPC.MONITOR_STOP, () => this.audio.stopMonitor());
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
          return this.audio.playToMic(this.library.byId(id));
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
              "mp3",
              "wav",
              "ogg",
              "oga",
              "flac",
              "m4a",
              "aac",
              "opus",
              "webm",
            ],
          },
        ],
      });
      if (result.canceled) return [];
      return result.filePaths;
    });
  }
}

new SoundGrid().start().catch((err) => {
  console.error("SoundGrid failed to start:", err);
  app.quit();
});
