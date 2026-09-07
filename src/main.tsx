import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TowerScreen } from "./tower";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <TowerScreen />
    </StrictMode>,
  );
}
