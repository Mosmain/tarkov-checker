/// <reference types="vite/client" />
/// <reference types="vue-router/auto-resolver" />
/// <reference types="vue-router/auto-routes" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
