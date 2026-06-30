// Tiny reactive store. No framework — a single source of truth + subscribe.
// Components read state and call store.update() / store.actions.* to mutate.

import {
  AudioDevice,
  DEFAULT_SETTINGS,
  Settings,
  SoundClip,
} from "../../shared/types";

export interface NowPlaying {
  clipId: string;
  name: string;
  paused: boolean;
}

export interface State {
  clips: SoundClip[];
  settings: Settings;
  devices: {
    micOutputs: AudioDevice[];
    monitors: AudioDevice[];
    realMics: AudioDevice[];
  };
  devicesStatus: "loading" | "ready" | "permission-needed" | "error";
  filter: string;
  activeCategory: string;
  // live transport
  micPlaying: NowPlaying | null;
  monitorPlaying: NowPlaying | null;
  micMuted: boolean;
  monitorMuted: boolean;
  micVolume: number; // 0..1
  monitorVolume: number; // 0..1
  // ui
  settingsOpen: boolean;
}

type Listener = () => void;

class Store {
  state: State;
  private listeners = new Set<Listener>();

  constructor(initial: State) {
    this.state = initial;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn();
  }

  update(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }
}

export const store = new Store({
  clips: [],
  settings: { ...DEFAULT_SETTINGS },
  devices: { micOutputs: [], monitors: [], realMics: [] },
  devicesStatus: "loading",
  filter: "",
  activeCategory: "All",
  micPlaying: null,
  monitorPlaying: null,
  micMuted: false,
  monitorMuted: false,
  micVolume: 0.9,
  monitorVolume: 0.8,
  settingsOpen: false,
});
