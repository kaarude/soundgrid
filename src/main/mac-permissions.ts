export type MacMediaAccessStatus =
  "not-determined" | "granted" | "denied" | "restricted" | "unknown";

export interface MacMicrophonePreferences {
  getMediaAccessStatus(mediaType: "microphone"): MacMediaAccessStatus;
  askForMediaAccess(mediaType: "microphone"): Promise<boolean>;
}

let microphoneRequestInFlight: Promise<boolean> | undefined;

export async function ensureMacMicrophoneAccess(
  preferences: MacMicrophonePreferences,
  options: { prompt: boolean },
): Promise<boolean> {
  const status = preferences.getMediaAccessStatus("microphone");
  if (status === "granted") return true;
  if (status !== "not-determined" || !options.prompt) return false;
  if (microphoneRequestInFlight) return microphoneRequestInFlight;

  const request = preferences
    .askForMediaAccess("microphone")
    .catch(() => false);
  microphoneRequestInFlight = request;
  try {
    return await request;
  } finally {
    if (microphoneRequestInFlight === request) {
      microphoneRequestInFlight = undefined;
    }
  }
}
