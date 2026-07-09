import { app, shell } from "electron";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { CableStatus } from "../shared/types.js";
import { AudioEngine } from "./audio-engine.js";

const execFileAsync = promisify(execFile);
const VB_CABLE_ARCHIVE_SHA256 =
  "b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb";

export class DriverManager {
  private rebootRequired = false;

  constructor(private readonly audio: AudioEngine) {}

  async status(): Promise<CableStatus> {
    if (process.platform === "darwin") {
      const devices = await this.audio.listDevices();
      const installed = devices.micOutputs.some((device) =>
        /blackhole|soundflower|loopback audio/i.test(device.label),
      );
      return {
        supported: true,
        installed,
        canInstall: true,
        rebootRequired: false,
        name: "BlackHole",
        installLabel: "Open BlackHole installer",
        websiteLabel: "BlackHole project page",
        attribution:
          "BlackHole is a separate open-source macOS audio loopback driver by Existential Audio.",
        message: installed
          ? "A macOS loopback device is installed and ready to select as the mic output."
          : "BlackHole 2ch is required to send clips into voice applications on macOS. The installer opens in your browser.",
      };
    }
    if (process.platform !== "win32") {
      return {
        supported: false,
        installed: false,
        canInstall: false,
        rebootRequired: false,
        name: "Virtual audio cable",
        installLabel: "Install virtual audio cable",
        websiteLabel: "Learn more",
        attribution: "A compatible virtual audio device is required.",
        message:
          "Guided virtual audio cable setup is available on Windows and macOS.",
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
      name: "VB-CABLE",
      installLabel: "Install VB-CABLE",
      websiteLabel: "VB-Audio donation page",
      attribution:
        "VB-CABLE is separate donationware by VB-Audio Software. All participation is welcome.",
      message: installed
        ? "VB-CABLE is installed and ready to select as the mic output."
        : this.rebootRequired
          ? "Installation finished. Restart Windows before using VB-CABLE."
          : "VB-CABLE is required to send clips into voice applications.",
    };
  }

  async install(): Promise<CableStatus> {
    if (process.platform === "darwin") {
      await shell.openExternal("https://existential.audio/blackhole/");
      return this.status();
    }
    if (process.platform !== "win32") return this.status();
    const archive = findPackage();
    if (!archive)
      throw new Error(
        "The verified VB-CABLE package is missing from this build.",
      );
    await verifySha256(archive, VB_CABLE_ARCHIVE_SHA256);

    const destination = await mkdtemp(
      path.join(app.getPath("temp"), "SoundGrid-VB-CABLE-"),
    );
    try {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1]",
        archive,
        destination,
      ]);
      const setup = path.join(destination, "VBCABLE_Setup_x64.exe");
      if (!existsSync(setup))
        throw new Error("VB-CABLE setup could not be extracted.");
      await verifyAuthenticodeSignature(setup);

      // Start-Process is used solely to display the standard Windows elevation
      // prompt. VB-Audio's own signed UI remains visible and owns installation.
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Start-Process -FilePath $args[0] -Verb RunAs -Wait",
        setup,
      ]);
    } finally {
      await rm(destination, { recursive: true, force: true });
    }
    this.rebootRequired = true;
    return this.status();
  }

  openDonationPage(): Promise<void> {
    if (process.platform === "darwin") {
      return shell.openExternal("https://existential.audio/blackhole/");
    }
    return shell.openExternal(
      "https://shop.vb-audio.com/en/win-apps/11-vb-cable.html",
    );
  }
}

function findPackage(): string | undefined {
  const candidates = [
    app.isPackaged
      ? path.join(process.resourcesPath, "vendor", "VBCABLE_Driver_Pack45.zip")
      : undefined,
    path.join(
      app.getAppPath(),
      "vendor",
      "vb-cable",
      "VBCABLE_Driver_Pack45.zip",
    ),
  ].filter((value): value is string => Boolean(value));
  return candidates.find(existsSync);
}

async function verifySha256(filePath: string, expected: string): Promise<void> {
  const actual = createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
  if (actual !== expected) {
    throw new Error("VB-CABLE package checksum verification failed.");
  }
}

async function verifyAuthenticodeSignature(filePath: string): Promise<void> {
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    [
      "$signature = Get-AuthenticodeSignature -LiteralPath $args[0]",
      "if ($signature.Status -ne 'Valid') { throw 'Invalid VB-CABLE setup signature.' }",
      "if ($signature.SignerCertificate.Subject -notlike '*VB-Audio*') { throw 'Unexpected VB-CABLE setup signer.' }",
    ].join("; "),
    filePath,
  ]);
}
