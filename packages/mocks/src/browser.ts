import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { restoreMockData, saveMockData } from "./persist";

/**
 * Starts the mock API in the browser. Both apps use the one worker at the site root,
 * and share the demo data through this tab's storage (persist.ts).
 */
export async function startMocks() {
  restoreMockData();
  const worker = setupWorker(...handlers);
  // Save after every change, and when leaving the page (for example, switching to the owner portal).
  worker.events.on("response:mocked", ({ request }) => {
    if (request.method !== "GET") saveMockData();
  });
  window.addEventListener("pagehide", saveMockData);
  await worker.start({
    onUnhandledFrame: "bypass",
    quiet: true,
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
}
