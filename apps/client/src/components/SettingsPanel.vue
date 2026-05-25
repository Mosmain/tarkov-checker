<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useSettingsStore, type ExtractFactionFilter } from "../stores/settings";
import { FACTION_COLORS } from "@shared/maps";

const settings = useSettingsStore();
const { apiLang, extractFactions, extractsVisible, extractLabelMode } = storeToRefs(settings);

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const FACTION_OPTIONS: ReadonlyArray<{
  value: ExtractFactionFilter;
  label: string;
  color: string;
}> = [
  { value: "pmc", label: "PMC", color: FACTION_COLORS.pmc },
  { value: "scav", label: "Scav", color: FACTION_COLORS.scav },
  { value: "shared", label: "Shared", color: FACTION_COLORS.shared },
];

function toggle(): void {
  open.value = !open.value;
}

function onDocumentClick(event: MouseEvent): void {
  if (!open.value) return;
  if (root.value && !root.value.contains(event.target as Node)) {
    open.value = false;
  }
}

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape" && open.value) {
    open.value = false;
  }
}

onMounted(() => {
  document.addEventListener("mousedown", onDocumentClick);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocumentClick);
  document.removeEventListener("keydown", onKey);
});

const factionLabelDisabled = computed(() => !extractsVisible.value);
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-neutral-200 backdrop-blur transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
      :aria-expanded="open"
      aria-label="Settings"
      @click="toggle"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-5 w-5"
        aria-hidden="true"
      >
        <path
          d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
        />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>

    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="open"
        class="fixed inset-x-3 bottom-16 z-20 rounded-xl border border-white/10 bg-neutral-900/95 p-4 text-sm text-neutral-100 shadow-2xl backdrop-blur sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-full sm:mb-2 sm:w-64"
        role="dialog"
        aria-label="Settings"
      >
        <div class="space-y-4">
          <section>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Language
            </h3>
            <div class="flex gap-2">
              <label
                v-for="opt in (['en', 'ru'] as const)"
                :key="opt"
                class="flex flex-1 cursor-pointer items-center justify-center rounded-md border px-3 py-1.5 text-sm transition"
                :class="
                  apiLang === opt
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-100'
                    : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                "
              >
                <input
                  v-model="apiLang"
                  type="radio"
                  :value="opt"
                  name="api-lang"
                  class="sr-only"
                />
                {{ opt.toUpperCase() }}
              </label>
            </div>
          </section>

          <section>
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Extracts
              </h3>
              <label class="inline-flex cursor-pointer items-center gap-2">
                <span class="text-xs text-neutral-300">{{ extractsVisible ? "On" : "Off" }}</span>
                <span class="relative">
                  <input v-model="extractsVisible" type="checkbox" class="peer sr-only" />
                  <span
                    class="block h-5 w-9 rounded-full bg-neutral-700 transition peer-checked:bg-emerald-600"
                  ></span>
                  <span
                    class="absolute left-0.5 top-0.5 block h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4"
                  ></span>
                </span>
              </label>
            </div>

            <div
              class="space-y-1.5 transition"
              :class="factionLabelDisabled ? 'opacity-40 pointer-events-none' : ''"
            >
              <label
                v-for="opt in FACTION_OPTIONS"
                :key="opt.value"
                class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-neutral-600 bg-neutral-800 text-emerald-500 focus:ring-emerald-500/60"
                  :checked="extractFactions.includes(opt.value)"
                  @change="settings.toggleFaction(opt.value)"
                />
                <span
                  class="h-2.5 w-2.5 rounded-full"
                  :style="{ backgroundColor: opt.color }"
                  aria-hidden="true"
                ></span>
                <span class="text-sm">{{ opt.label }}</span>
              </label>
            </div>

            <div
              class="mt-3 transition"
              :class="factionLabelDisabled ? 'opacity-40 pointer-events-none' : ''"
            >
              <p class="mb-1.5 text-xs text-neutral-400">Labels</p>
              <div class="flex gap-2">
                <label
                  v-for="opt in (['hover', 'smart'] as const)"
                  :key="opt"
                  class="flex flex-1 cursor-pointer items-center justify-center rounded-md border px-3 py-1.5 text-xs transition"
                  :class="
                    extractLabelMode === opt
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-100'
                      : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                  "
                >
                  <input
                    v-model="extractLabelMode"
                    type="radio"
                    :value="opt"
                    name="label-mode"
                    class="sr-only"
                  />
                  {{ opt === "hover" ? "On hover" : "Smart" }}
                </label>
              </div>
              <p class="mt-1.5 text-[10px] leading-relaxed text-neutral-500">
                Smart shows names only for extracts visible on screen at higher zoom.
              </p>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </div>
</template>
