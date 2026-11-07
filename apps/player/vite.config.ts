import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Blueprint §10.2.5–10.2.6: installable, but never required; caches the app shell only.
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.png", "icons/apple-touch-icon.png"],
      manifest: {
        name: "CourtFlex",
        short_name: "CourtFlex",
        description: "Find courts, join open play and play with your club.",
        start_url: "/home",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#001321",
        background_color: "#001321",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The mock API's worker and big map chunks stay out of the precache.
        globIgnores: ["mockServiceWorker.js", "**/VenueMap-*"],
        navigateFallback: "/index.html",
        // The owner portal and admin are separate apps on the same address: never answer them from this cache.
        navigateFallbackDenylist: [/^\/api\//, /^\/owner(\/|$)/, /^\/admin(\/|$)/],
        // No runtimeCaching: API responses are never cached (a cached slot is not a reservation).
        runtimeCaching: [],
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // 127.0.0.1 explicitly: plain "localhost" can end up IPv6-only, and then 127.0.0.1 doesn't answer.
    // Browsers still reach it at http://localhost:5174.
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    // One address for everyone: /owner is the owner portal's dev server (apps/portal),
    // /admin the Super Admin portal's (apps/admin).
    proxy: {
      "/owner": { target: "http://127.0.0.1:5173", ws: true },
      "/admin": { target: "http://127.0.0.1:5175", ws: true },
    },
  },
});
