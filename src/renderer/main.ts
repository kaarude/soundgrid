import "./styles/app.css";
import { App } from "./components/App";

const root = document.getElementById("app");
if (root) {
  root.append(App());
}
