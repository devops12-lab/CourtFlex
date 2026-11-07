import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The owner portal lives under /owner on the same address as the player app.
// In development, open it through the player server (http://localhost:5174/owner/),
// which passes /owner through to this one.
export default defineConfig({
  base: "/owner/",
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
