/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vue-router/auto-resolver" />
/// <reference types="vue-router/auto-routes" />

interface ImportMetaEnv {
  /** LAN Node backend port (Fastify). Defaults to 3000 when unset. */
  readonly VITE_SERVER_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
