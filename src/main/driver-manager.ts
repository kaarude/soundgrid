import { app, shell } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { AudioEngine } from "./audio-engine.js";

const execFileAsync = promisify(execFile);

export interface CableStatus {
  supported: boolean;
  installed: boolean;
  canInstall: boolean;
  rebootRequired: boolean;
  message: string;
}

export class DriverManager {
  private rebootRequired = false;

  constructor(private readonly audio: AudioEngine) {}

  async status(): Promise<CableStatus> {
    if (process.platform !== "win32") {
      return {
        supported: false,
        installed: false,
        canInstall: false,
        rebootRequired: false,
        message: "VB-CABLE installation is available in the Windows build.",
      };
    }
    const devices = await this.audio.listDevices();
    const installed = devices.micOutputs.some((device) =>
      /cable input|vb-audio.*cable/i.test(device.label),
    );
    return {
      supported: true,
      installed,
      canInstall: Boolean(findPackage()),
      rebootRequired: this.rebootRequired,
      message: installed
        ? "VB-CABLE is installed and ready to select as the mic output."
        : this.rebootRequired
          ? "Installation finished. Restart Windows before using VB-CABLE."
          : "VB-CABLE is required to send clips into voice applications.",
    };
  }

  async install(): Promise<CableStatus> {
    if (process.platform !== "win32") return this.status();
    const archive = findPackage();
    if (!archive) throw new Error("The verified VB-CABLE package is missing from this build.");

    const destination = path.join(app.getPath("temp"), "SoundGrid", "VB-CABLE-4.5");
    await mkdir(destination, { recursive: true });
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
      archive,
      destination,
    ]);
    const setup = path.join(destination, "VBCABLE_Setup_x64.exe");
    if (!existsSync(setup)) throw new Error("VB-CABLE setup could not be extracted.");

    // Start-Process is used solely to display the standard Windows elevation
    // prompt. VB-Audio's own signed UI remains visible and owns installation.
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Start-Process -FilePath $args[0] -Verb RunAs -Wait",
      setup,
    ]);
    this.rebootRequired = true;
    return this.status();
  }

  openDonationPage(): Promise<void> {
    return shell.openExternal("https://shop.vb-audio.com/en/win-apps/11-vb-cable.html");
  }
}

function findPackage(): string | undefined {
  const candidates = [
    app.isPackaged
      ? path.join(process.resourcesPath, "vendor", "VBCABLE_Driver_Pack45.zip")
      : undefined,
    path.join(app.getAppPath(), "vendor", "vb-cable", "VBCABLE_Driver_Pack45.zip"),
  ].filter((value): value is string => Boolean(value));
  return candidates.find(existsSync);
}
