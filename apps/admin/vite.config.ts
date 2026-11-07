import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The Super Admin portal lives under /admin on the same address as the player app.
// In development, open it through the player server (http://localhost:5174/admin/),
// which passes /admin through to this one.
export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 5175, strictPort: true },
});
