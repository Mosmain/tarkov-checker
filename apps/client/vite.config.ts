import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

const sharedSrc = fileURLToPath(new URL("../../packages/shared/src", import.meta.url));
const clientSrc = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "tarkov-checker",
        short_name: "tarkov",
        description: "Escape from Tarkov live in-raid map",
        theme_color: "#0b0b0b",
        background_color: "#0b0b0b",
        display: "standalone",
        orientation: "portrait",
        // TODO: replace placeholder icons before first PWA release.
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      { find: /^@shared\/(.*)$/, replacement: `${sharedSrc}/$1` },
      { find: /^@shared$/, replacement: `${sharedSrc}/index.ts` },
      { find: /^@\/(.*)$/, replacement: `${clientSrc}/$1` },
    ],
  },
  server: {
    host: true,
    port: 5173,
  },
});
