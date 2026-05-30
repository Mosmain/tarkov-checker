import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import { fileURLToPath, URL } from 'node:url';

const sharedSrc = fileURLToPath(new URL('../../packages/shared/src', import.meta.url));
const clientSrc = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  // Mirror vite.config.ts's AutoImport so source files referencing bare
  // `ref`/`watch`/`onMounted`/etc. resolve under vitest the same way they do
  // in dev/build. dts + eslintrc generation is owned by vite.config — don't
  // double-write the .d.ts from here.
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia', '@vueuse/core', 'vue-i18n'],
      dts: false,
      eslintrc: { enabled: false },
      vueTemplate: true,
    }),
  ],
  resolve: {
    alias: [
      { find: /^@shared\/(.*)$/, replacement: `${sharedSrc}/$1` },
      { find: /^@shared$/, replacement: `${sharedSrc}/index.ts` },
      { find: /^@\/(.*)$/, replacement: `${clientSrc}/$1` },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
  },
});
