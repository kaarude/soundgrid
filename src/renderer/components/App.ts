import { SoundClip, Settings } from "../../shared/types";

// Minimal no-framework UI. Each component returns a real DOM node so we
// don't pull React/Vue into the bundle. This keeps the .exe small and the
// code easy to read.

export function App(): HTMLElement {
  const el = document.createElement("div");
  el.className = "app";

  el.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <span class="logo">▦</span>
        <span class="name">SoundGrid</span>
      </div>
      <div class="transport">
        <div class="bus" data-bus="mic">
          <span class="bus-label">Mic out</span>
          <button class="tbtn" data-act="mic-pause" title="Pause mic bus">⏸</button>
          <button class="tbtn" data-act="mic-resume" title="Resume mic bus">▶</button>
          <button class="tbtn danger" data-act="mic-stop" title="Stop mic bus">■</button>
          <button class="tbtn" data-act="mic-mute" title="Mute mic bus">🔇</button>
          <input type="range" class="vol" data-vol="mic" min="0" max="100" value="90" />
        </div>
        <div class="bus" data-bus="monitor">
          <span class="bus-label">Headphones</span>
          <button class="tbtn" data-act="mon-pause" title="Pause monitor">⏸</button>
          <button class="tbtn" data-act="mon-stop" title="Stop monitor">■</button>
          <input type="range" class="vol" data-vol="monitor" min="0" max="100" value="80" />
        </div>
        <button class="tbtn danger big" data-act="stop-all" title="Stop everything">Stop all</button>
      </div>
    </header>

    <div class="body">
      <aside class="sidebar">
        <input class="search" data-el="search" placeholder="Search sounds…" />
        <div class="cats" data-el="cats"></div>
        <button class="import" data-act="import">+ Import audio</button>
      </aside>

      <main class="grid" data-el="grid"></main>

      <section class="settings" data-el="settings">
        <h2>Settings</h2>
        <div class="settings-grid" data-el="settings-grid"></div>
      </section>
    </div>
  `;

  let clips: SoundClip[] = [];
  let settings: Settings | null = null;
  let filter = "";
  let activeCategory = "All";

  const grid = el.querySelector<HTMLElement>('[data-el="grid"]')!;
  const cats = el.querySelector<HTMLElement>('[data-el="cats"]')!;
  const search = el.querySelector<HTMLInputElement>('[data-el="search"]')!;
  const settingsGrid = el.querySelector<HTMLElement>(
    '[data-el="settings-grid"]',
  )!;

  async function refresh() {
    clips = await window.soundgrid.getLibrary();
    settings = await window.soundgrid.getSettings();
    renderCategories();
    renderGrid();
    renderSettings();
    syncTransport();
  }

  function categories(): string[] {
    const set = new Set<string>(clips.map((c) => c.category));
    return ["All", ...[...set].sort()];
  }

  function renderCategories() {
    cats.innerHTML = "";
    for (const c of categories()) {
      const b = document.createElement("button");
      b.className = "cat" + (c === activeCategory ? " active" : "");
      b.textContent = c;
      b.onclick = () => {
        activeCategory = c;
        renderCategories();
        renderGrid();
      };
      cats.append(b);
    }
  }

  function renderGrid() {
    grid.innerHTML = "";
    const list = clips.filter((c) => {
      const inCat = activeCategory === "All" || c.category === activeCategory;
      const inSearch = !filter || c.name.toLowerCase().includes(filter);
      return inCat && inSearch;
    });

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent =
        "No sounds yet. Click “Import audio” to add MP3, WAV, OGG, M4A, FLAC…";
      grid.append(empty);
      return;
    }

    for (const clip of list) {
      grid.append(SoundCard(clip));
    }
  }

  function SoundCard(clip: SoundClip): HTMLElement {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-name">${escapeHtml(clip.name)}</div>
      <div class="card-cat">${escapeHtml(clip.category)}</div>
      <div class="card-actions">
        <button class="play-mic" title="Play to mic">🔊 Mic</button>
        <button class="play-mon" title="Play to headphones only">🎧 Preview</button>
        <button class="del" title="Remove">✕</button>
      </div>
    `;
    card
      .querySelector(".play-mic")!
      .addEventListener("click", () => window.soundgrid.micPlay(clip.id));
    card
      .querySelector(".play-mon")!
      .addEventListener("click", () => window.soundgrid.monitorPlay(clip.id));
    card.querySelector(".del")!.addEventListener("click", async () => {
      await window.soundgrid.removeClip(clip.id);
      refresh();
    });
    return card;
  }

  function renderSettings() {
    if (!settings) return;
    const rows: [string, string][] = [
      ["Mic output device", "dropdown:micOutput"],
      ["Headphone device", "dropdown:monitor"],
      ["Real mic (passthrough)", "dropdown:realMic"],
      ["Passthrough real mic", "toggle:passthrough"],
      ["Headset-only mode", "toggle:headsetOnly"],
      ["Mic-only mode", "toggle:micOnly"],
      ["Overlap behavior", "select:overlap:stop|overlap|queue"],
      ["Run on startup", "toggle:runOnStartup"],
      ["Minimize to tray", "toggle:minimizeToTray"],
      ["Auto-select mic", "toggle:autoSelectMic"],
      ["Theme", "select:theme:dark|light|system"],
    ];

    settingsGrid.innerHTML = "";
    for (const [label, spec] of rows) {
      const row = document.createElement("label");
      row.className = "setting";
      const left = document.createElement("span");
      left.textContent = label;
      row.append(left);
      row.append(makeControl(spec, settings));
      settingsGrid.append(row);
    }
  }

  function makeControl(spec: string, s: Settings): HTMLElement {
    const [kind, key, opts] = spec.split(":");
    const wrap = document.createElement("div");

    if (kind === "toggle") {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      // @ts-expect-error dynamic key on a known-shaped object
      cb.checked = !!s[key];
      cb.addEventListener("change", () => {
        window.soundgrid.setSettings({ [key]: cb.checked });
      });
      wrap.append(cb);
    } else if (kind === "select") {
      const sel = document.createElement("select");
      for (const opt of (opts ?? "").split("|")) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        sel.append(o);
      }
      // @ts-expect-error dynamic key
      sel.value = s[key];
      sel.addEventListener("change", () => {
        window.soundgrid.setSettings({ [key]: sel.value });
      });
      wrap.append(sel);
    } else if (kind === "dropdown") {
      const sel = document.createElement("select");
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent =
        "(select a device — install a virtual cable for mic out)";
      sel.append(ph);
      // Real device options are populated from the renderer-side enumerateDevices.
      sel.dataset.target = key;
      sel.disabled = true;
      wrap.append(sel);
    }
    return wrap;
  }

  function syncTransport() {
    if (!settings) return;
    el.querySelector<HTMLInputElement>('[data-vol="mic"]')!.value = String(
      Math.round(settings.masterMicVolume * 100),
    );
    el.querySelector<HTMLInputElement>('[data-vol="monitor"]')!.value = String(
      Math.round(settings.monitorVolume * 100),
    );
  }

  // ---- Wire up top-level actions ----
  search.addEventListener("input", () => {
    filter = search.value.toLowerCase();
    renderGrid();
  });

  el.querySelector('[data-act="import"]')!.addEventListener(
    "click",
    async () => {
      const files = await window.soundgrid.pickAudioFiles();
      if (files.length) {
        await window.soundgrid.importFiles(files);
        refresh();
      }
    },
  );

  el.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;
    if (!act) return;
    switch (act) {
      case "mic-pause":
        window.soundgrid.micPause();
        break;
      case "mic-resume":
        window.soundgrid.micResume();
        break;
      case "mic-stop":
        window.soundgrid.micStop();
        break;
      case "mic-mute":
        window.soundgrid.micSetMute(true);
        break;
      case "mon-pause":
        window.soundgrid.monitorPause();
        break;
      case "mon-stop":
        window.soundgrid.monitorStop();
        break;
      case "stop-all":
        window.soundgrid.micStopAll();
        break;
    }
  });

  el.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    const vol = t.closest<HTMLElement>("[data-vol]")?.dataset.vol;
    if (!vol) return;
    const v = Number(t.value) / 100;
    if (vol === "mic") window.soundgrid.micSetVolume(v);
    if (vol === "monitor") window.soundgrid.monitorSetVolume(v);
  });

  refresh();
  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}
