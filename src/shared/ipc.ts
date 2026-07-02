// IPC channel name constants. Keeping these in one file prevents typos
// across the main, preload, and renderer processes.

export const IPC = {
  // Library
  LIBRARY_GET: "library:get",
  LIBRARY_IMPORT: "library:import",
  LIBRARY_REMOVE: "library:remove",
  LIBRARY_UPDATE_CLIP: "library:updateClip",
  LIBRARY_UPDATE_CLIPS: "library:updateClips",
  LIBRARY_RESCAN: "library:rescan",
  LIBRARY_CHANGED: "library:changed",

  // Settings
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",

  // Audio devices
  DEVICES_LIST: "devices:list",
  DEVICES_REFRESH: "devices:refresh",
  CABLE_STATUS: "cable:status",
  CABLE_INSTALL: "cable:install",
  CABLE_DONATE: "cable:donate",

  // Audio transport (mic output bus)
  PLAY_BOTH: "audio:playBoth",
  MIC_PLAY: "mic:play",
  MIC_PAUSE: "mic:pause",
  MIC_RESUME: "mic:resume",
  MIC_STOP: "mic:stop",
  MIC_STOP_ALL: "mic:stopAll",
  MIC_SET_MUTE: "mic:setMute",
  MIC_SET_VOLUME: "mic:setVolume",

  // Audio transport (monitor / headphone bus)
  MONITOR_PLAY: "monitor:play",
  MONITOR_PAUSE: "monitor:pause",
  MONITOR_RESUME: "monitor:resume",
  MONITOR_STOP: "monitor:stop",
  MONITOR_SET_MUTE: "monitor:setMute",
  MONITOR_SET_VOLUME: "monitor:setVolume",

  // Hotkeys
  HOTKEYS_REGISTER: "hotkeys:register",
  HOTKEYS_UNREGISTER: "hotkeys:unregister",

  // Events pushed from main -> renderer
  ON_STATE: "state:on",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
