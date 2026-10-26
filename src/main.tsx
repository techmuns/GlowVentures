import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { PortfolioProvider } from "./context/PortfolioContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { recoverChunkLoad } from "./lib/chunkRecovery";
import { initializeNavigationEntry } from './lib/navigationMemory';

initializeNavigationEntry();

window.addEventListener("vite:preloadError", (event) => {
  recoverChunkLoad((event as Event & { payload: unknown }).payload);
  // Let a persistent failure reach ErrorBoundary. Preventing the rejection
  // would turn a failed React.lazy import into an undefined module instead.
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <PortfolioProvider>
          <App />
        </PortfolioProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
