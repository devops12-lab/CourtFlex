import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configureApi } from "@courtflex/api";
import { setMocksEnabled } from "@courtflex/features";
import { hideSplash } from "@courtflex/ui";
import { App } from "./app/App";
import "./styles.css";

configureApi({ baseUrl: import.meta.env.VITE_API_URL ?? "/api/v1" });
const useMocks = import.meta.env.VITE_USE_MOCKS !== "false";
setMocksEnabled(useMocks);

/** Same mock API as the owner portal until the Laravel API exists. */
async function enableMocks() {
  if (!useMocks) return;
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
