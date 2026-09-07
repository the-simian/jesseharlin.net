import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OrreryScreen } from "./orrery";
import { TowerScreen } from "./tower";
import "./styles.css";
import "./orrery/orrery.css";

const root = document.getElementById("root");
if (root) {
  const screen = window.location.hash === "#tower" ? <TowerScreen /> : <OrreryScreen />;
  createRoot(root).render(<StrictMode>{screen}</StrictMode>);
}
