import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiKeyProvider } from "./context/ApiKeyContext.js";
import { App } from "./App.js";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiKeyProvider>
      <App />
    </ApiKeyProvider>
  </StrictMode>,
);
