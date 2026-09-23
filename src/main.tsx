import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// A page left open across a publish asks for code files that no longer exist,
// which shows up as blank sheets or pages. Reload once to pick up the live build.
window.addEventListener("vite:preloadError", (event) => {
  const key = "yg-chunk-reload";
  const last = Number(sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last < 30_000) return; // already tried; don't loop
  sessionStorage.setItem(key, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
