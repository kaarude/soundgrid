import { SoundClip } from "../../shared/types";
import { icon } from "./icons";
import { store } from "./store";

// A single clip card — the firing surface. Two foot actions express the
// two-bus model per clip: Mic (broadcast) and Preview (monitor-only).
// Hover lights the hairline border Signal Violet (The Flat-At-Rest Rule).

export function SoundCard(clip: SoundClip): HTMLElement {
  const card = document.createElement("article");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("aria-label", `${clip.name} — ${clip.category}`);

  const top = document.createElement("div");
  top.className = "card-top";
  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = clip.name;
  const cat = document.createElement("div");
  cat.className = "card-cat";
  cat.textContent = clip.category;
  top.append(name, cat);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const micBtn = document.createElement("button");
  micBtn.type = "button";
  micBtn.className = "card-btn card-btn--mic";
  micBtn.title = "Play to mic (broadcast)";
  micBtn.append(icon.mic());
  const micLabel = document.createElement("span");
  micLabel.textContent = "Mic";
  micBtn.append(micLabel);
  micBtn.addEventListener("click", () => {
    micBtn.classList.remove("is-firing");
    void micBtn.offsetWidth; // restart the animation
    micBtn.classList.add("is-firing");
    fireMic(clip);
  });

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "card-btn card-btn--preview";
  prevBtn.title = "Preview on headphones only";
  prevBtn.append(icon.headphones());
  const prevLabel = document.createElement("span");
  prevLabel.textContent = "Preview";
  prevBtn.append(prevLabel);
  prevBtn.addEventListener("click", () => firePreview(clip));

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "card-btn card-btn--del";
  delBtn.title = "Remove";
  delBtn.setAttribute("aria-label", `Remove ${clip.name}`);
  delBtn.append(icon.trash());
  delBtn.addEventListener("click", async () => {
    await window.soundgrid.removeClip(clip.id);
  });

  actions.append(micBtn, prevBtn, delBtn);
  card.append(top, actions);
  return card;
}

async function fireMic(clip: SoundClip): Promise<void> {
  await window.soundgrid.micPlay(clip.id);
  store.update({
    micPlaying: { clipId: clip.id, name: clip.name, paused: false },
    micMuted: false,
  });
}

async function firePreview(clip: SoundClip): Promise<void> {
  await window.soundgrid.monitorPlay(clip.id);
  store.update({
    monitorPlaying: { clipId: clip.id, name: clip.name, paused: false },
  });
}
