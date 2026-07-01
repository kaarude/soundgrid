import { AudioDevice, AudioDevices, Settings, SoundClip } from "./types.js";

export type ClipBus = "mic" | "monitor";

export function clipBuses(clip: SoundClip, micOnly: boolean): ClipBus[] {
  const buses: ClipBus[] = [];
  if (clip.broadcast) buses.push("mic");
  if (!micOnly) buses.push("monitor");
  return buses;
}

export function isHeadphoneDevice(device: AudioDevice): boolean {
  return /head(phone|set)|earbud|airpod/i.test(device.label);
}

export function selectableMonitorDevices(
  devices: AudioDevices,
  settings: Pick<Settings, "headsetOnly">,
): AudioDevice[] {
  return settings.headsetOnly
    ? devices.monitors.filter(isHeadphoneDevice)
    : devices.monitors;
}

export function reconcileAudioRouting(
  settings: Settings,
  devices: AudioDevices,
): Partial<Settings> {
  const patch: Partial<Settings> = {};
  const withPatch = () => ({ ...settings, ...patch });
  const setIfChanged = <Key extends keyof Settings>(
    key: Key,
    value: Settings[Key],
  ) => {
    if (settings[key] !== value) patch[key] = value;
  };

  if (settings.headsetOnly && settings.monitorDeviceId) {
    const selectedMonitor = devices.monitors.find(
      (device) => device.id === settings.monitorDeviceId,
    );
    if (selectedMonitor && !isHeadphoneDevice(selectedMonitor)) {
      setIfChanged("monitorDeviceId", null);
    }
  }

  if (!settings.autoSelectMic) return patch;

  const next = withPatch();
  if (!deviceExists(next.micOutputDeviceId, devices.micOutputs)) {
    setIfChanged("micOutputDeviceId", preferredMicOutput(devices));
  }
  if (
    !deviceExists(
      withPatch().monitorDeviceId,
      selectableMonitorDevices(devices, withPatch()),
    )
  ) {
    setIfChanged("monitorDeviceId", preferredMonitor(devices, withPatch()));
  }
  if (
    withPatch().passthrough &&
    !deviceExists(withPatch().realMicDeviceId, devices.realMics)
  ) {
    setIfChanged("realMicDeviceId", devices.realMics[0]?.id ?? null);
  }

  return patch;
}

export function routeIsAvailable(
  selected: string | null,
  devices: AudioDevice[],
): boolean {
  return Boolean(selected && devices.some((device) => device.id === selected));
}

function preferredMicOutput(devices: AudioDevices): string | null {
  return (
    devices.micOutputs.find((device) => /cable input/i.test(device.label))
      ?.id ??
    devices.micOutputs[0]?.id ??
    null
  );
}

function preferredMonitor(
  devices: AudioDevices,
  settings: Pick<Settings, "headsetOnly">,
): string | null {
  const eligible = selectableMonitorDevices(devices, settings);
  return (
    eligible.find((device) => !/cable/i.test(device.label))?.id ??
    eligible[0]?.id ??
    null
  );
}

function deviceExists(
  selected: string | null,
  devices: AudioDevice[],
): boolean {
  return Boolean(selected && devices.some((device) => device.id === selected));
}
