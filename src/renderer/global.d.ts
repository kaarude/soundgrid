import { SoundGridApi } from "../preload/preload";

declare global {
  interface Window {
    soundgrid: SoundGridApi;
  }
}

export {};
