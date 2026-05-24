import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

const sharedSrc = fileURLToPath(new URL("../../packages/shared/src", import.meta.url));
const clientSrc = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: /^@shared\/(.*)$/, replacement: `${sharedSrc}/$1` },
      { find: /^@shared$/, replacement: `${sharedSrc}/index.ts` },
      { find: /^@\/(.*)$/, replacement: `${clientSrc}/$1` },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.ts"],
  },
});
