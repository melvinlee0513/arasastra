import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerAppServiceWorker } from "./pwa/registerSW";

createRoot(document.getElementById("root")!).render(<App />);

// Guarded — refuses to register in dev, iframes, Lovable preview, or with ?sw=off.
registerAppServiceWorker();

// no-op: sync marker
