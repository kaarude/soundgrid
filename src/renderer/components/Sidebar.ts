import { icon } from "./icons";
import { importAudioFiles } from "./library-actions";
import { store } from "./store";

// Collapsible utility rail: search and import stay separate from library views.

export function Sidebar(): HTMLElement {
  const el = document.createElement("aside");
  el.className = "sidebar is-collapsed";

  const toggle = document.createElement("button");
  toggle.className = "sidebar-toggle";
  toggle.type = "button";
  toggle.title = "Toggle sidebar";
  toggle.setAttribute("aria-label", "Toggle sidebar");
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

  const importBtn = document.createElement("button");
  importBtn.className = "import";
  importBtn.type = "button";
  importBtn.append(icon.plus());
  const importLabel = document.createElement("span");
  importLabel.className = "import-label";
  importLabel.textContent = "Import audio";
  importBtn.append(importLabel);
  importBtn.addEventListener("click", () => void importAudioFiles());

  el.append(toggle, searchWrap, importBtn);
  return el;
}

export function syncSidebar(): void {
  // keep the search field in sync if state.filter changed externally
  const search = document.querySelector<HTMLInputElement>("#sg-search");
  if (search && search.value.toLowerCase() !== store.state.filter) {
    search.value = store.state.filter;
  }
}
