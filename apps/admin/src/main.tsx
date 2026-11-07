import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configureApi } from "@courtflex/api";
import { setMocksEnabled } from "@courtflex/features";
import { hideSplash } from "@courtflex/ui";
import { App } from "./app/App";
import "./styles.css";

configureApi({ baseUrl: import.meta.env.VITE_API_URL ?? "/api/v1" });
setMocksEnabled(import.meta.env.VITE_USE_MOCKS !== "false");

/**
 * Until the Laravel API exists, requests are answered by the mock API in
 * packages/mocks. Set VITE_USE_MOCKS=false to talk to a real backend.
 */
async function enableMocks() {
  if (import.meta.env.VITE_USE_MOCKS === "false") return;
  const { startMocks } = await import("@courtflex/mocks");
  await startMocks();
}

enableMocks().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  hideSplash();
});
