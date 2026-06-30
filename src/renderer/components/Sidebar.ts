import { icon } from "./icons";
import { store } from "./store";

// Collapsible cue rail: one sidebar that widens from icon-only to icon + label.

export function Sidebar(): HTMLElement {
  const el = document.createElement("aside");
  el.className = "sidebar is-collapsed";

  const toggle = document.createElement("button");
  toggle.className = "sidebar-toggle";
  toggle.type = "button";
  toggle.title = "Toggle categories";
  toggle.setAttribute("aria-label", "Toggle categories");
  toggle.setAttribute("aria-expanded", "false");
  toggle.append(icon.chevron());
  toggle.addEventListener("click", () => {
    const expanded = !el.classList.contains("is-collapsed");
    el.classList.toggle("is-collapsed", expanded);
    toggle.setAttribute("aria-expanded", String(!expanded));
  });

  const searchWrap = document.createElement("label");
  searchWrap.className = "search";
  const searchIcon = document.createElement("span");
  searchIcon.className = "search-icon";
  searchIcon.append(icon.search());
  const search = document.createElement("input");
  search.type = "search";
  search.id = "sg-search";
  search.placeholder = "Search sounds…";
  search.setAttribute("autocomplete", "off");
  search.addEventListener("input", () =>
    store.update({ filter: search.value.toLowerCase() }),
  );
  searchWrap.append(searchIcon, search);
  searchWrap.htmlFor = search.id;

  const cats = document.createElement("nav");
  cats.className = "cats";
  cats.setAttribute("aria-label", "Categories");

  const importBtn = document.createElement("button");
  importBtn.className = "import";
  importBtn.type = "button";
  importBtn.append(icon.plus());
  const importLabel = document.createElement("span");
  importLabel.className = "import-label";
  importLabel.textContent = "Import audio";
  importBtn.append(importLabel);
  importBtn.addEventListener("click", importAudio);

  el.append(toggle, searchWrap, cats, importBtn);
  return el;
}

export function syncSidebar(): void {
  const cats = document.querySelector<HTMLElement>(".cats");
  if (!cats) return;
  const { clips, activeCategory } = store.state;
  const set = new Set(clips.map((c) => c.category));
  const categories = ["All", ...[...set].sort()];

  cats.innerHTML = "";
  for (const c of categories) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cat" + (c === activeCategory ? " active" : "");
    b.title = c;
    b.setAttribute("aria-label", c);
    const iconWrap = document.createElement("span");
    iconWrap.className = "cat-icon";
    iconWrap.append(categoryIcon(c));
    const label = document.createElement("span");
    label.className = "cat-label";
    label.textContent = c;
    b.append(iconWrap, label);
    b.addEventListener("click", () => store.update({ activeCategory: c }));
    cats.append(b);
  }

  // keep the search field in sync if state.filter changed externally
  const search = document.querySelector<HTMLInputElement>("#sg-search");
  if (search && search.value.toLowerCase() !== store.state.filter) {
    search.value = store.state.filter;
  }
}

async function importAudio(): Promise<void> {
  const files = await window.soundgrid.pickAudioFiles();
  if (files.length) await window.soundgrid.importFiles(files);
}

function categoryIcon(category: string): SVGElement {
  const key = category.toLowerCase();
  if (key === "all") return icon.home();
  if (key.includes("ambience")) return icon.waves();
  if (key.includes("hit")) return icon.burst();
  if (key.includes("stinger")) return icon.zap();
  if (key.includes("voice") || key.includes("meme")) return icon.smile();
  if (key.includes("music")) return icon.music();
  if (key.includes("fx") || key.includes("sfx")) return icon.sparkles();
  if (key.includes("loop")) return icon.loop();
  return icon.grid();
}
