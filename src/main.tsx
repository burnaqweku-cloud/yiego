import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "./lib/sw-update";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker with proactive update polling
registerSW();
