import "./styles/app.css";
import { App } from "./components/App";

const root = document.getElementById("app");
if (root) {
  if (!(window as Window & { soundgrid?: unknown }).soundgrid) {
    const failure = document.createElement("main");
    failure.className = "startup-failure";
    const title = document.createElement("h1");
    title.textContent = "SoundGrid could not start";
    const detail = document.createElement("p");
    detail.textContent =
      "The desktop bridge did not load. Restart SoundGrid; if this continues, reinstall the latest version.";
    failure.append(title, detail);
    root.append(failure);
  } else {
    root.append(App());
  }
}
