import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import App from "./App.vue";
import { TarkovPreset } from "./theme";
import "./styles.css";

const app = createApp(App);
app.use(createPinia());
app.use(PrimeVue, {
  theme: {
    preset: TarkovPreset,
    options: {
      prefix: "p",
      darkModeSelector: ".dark",
      cssLayer: {
        name: "primevue",
        order: "theme, base, primevue, components, utilities",
      },
    },
  },
});
app.mount("#app");
