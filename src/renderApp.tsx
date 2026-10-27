import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { bootstrapWarning } from "./lib/runtimeBook";
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
      {bootstrapWarning && <div role="alert" className="bg-amber-50 px-4 py-2 text-sm text-amber-900">Latest statements could not be loaded. Showing saved data. <button onClick={() => window.location.reload()} className="underline">Retry</button></div>}
      <BrowserRouter>
        <PortfolioProvider>
          <App />
        </PortfolioProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
