<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useSettingsStore, type ExtractFactionFilter } from "../stores/settings";
import { FACTION_COLORS, TARKOV_MAPS, type TarkovMapCode } from "@shared/maps";
import type { ServerConfigResponse } from "@shared/config-api";
import { useUiText } from "../i18n";
import { fetchAllExtracts } from "../api/tarkov-dev";
import { fetchServerConfig, putServerConfig } from "../api/server-config";

const settings = useSettingsStore();
const { apiLang, extractFactions, extractsVisible, extractLabelMode, mapCode } =
  storeToRefs(settings);
const t = useUiText();

const MAP_CODES = Object.keys(TARKOV_MAPS) as TarkovMapCode[];
const localizedMapNames = ref<Partial<Record<string, string>>>({});

async function loadMapNames(): Promise<void> {
  try {
    const all = await fetchAllExtracts(apiLang.value);
    const byNameId: Record<string, string> = {};
    for (const entry of all) {
      byNameId[entry.nameId.toLowerCase()] = entry.name;
    }
    localizedMapNames.value = byNameId;
  } catch {
    // Fall back silently to TARKOV_MAPS.displayName via the helper below.
  }
}

void loadMapNames();
watch(apiLang, () => void loadMapNames());

function mapLabelFor(code: TarkovMapCode): string {
  return localizedMapNames.value[code.toLowerCase()] ?? TARKOV_MAPS[code].displayName;
}

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const FACTION_OPTIONS: ReadonlyArray<{
  value: ExtractFactionFilter;
  color: string;
}> = [
  { value: "pmc", color: FACTION_COLORS.pmc },
  { value: "scav", color: FACTION_COLORS.scav },
  { value: "shared", color: FACTION_COLORS.shared },
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

const SM_BREAKPOINT = 640;
const isDesktop = ref(typeof window !== "undefined" ? window.innerWidth >= SM_BREAKPOINT : true);
function onResize(): void {
  isDesktop.value = window.innerWidth >= SM_BREAKPOINT;
}

const serverConfig = ref<ServerConfigResponse | null>(null);
const gameDirInput = ref("");
const screenshotsDirInput = ref("");
const pathsLoading = ref(false);
const pathsSaving = ref(false);
const pathsError = ref<string | null>(null);
const pathsJustSaved = ref(false);

const gameDirLocked = computed(
  () => serverConfig.value?.gameDir.source === "env",
);
const screenshotsDirLocked = computed(
  () => serverConfig.value?.screenshotsDir.source === "env",
);

const gameDirDirty = computed(
  () => (serverConfig.value?.gameDir.value ?? "") !== gameDirInput.value,
);
const screenshotsDirDirty = computed(
  () => (serverConfig.value?.screenshotsDir.value ?? "") !== screenshotsDirInput.value,
);
const canSavePaths = computed(
  () =>
    isDesktop.value &&
    !pathsSaving.value &&
    (gameDirDirty.value || screenshotsDirDirty.value) &&
    (!gameDirLocked.value || !screenshotsDirDirty.value || screenshotsDirInput.value !== "") &&
    !(gameDirLocked.value && screenshotsDirLocked.value),
);

function syncInputsFromConfig(cfg: ServerConfigResponse): void {
  gameDirInput.value = cfg.gameDir.value ?? "";
  screenshotsDirInput.value = cfg.screenshotsDir.value ?? "";
}

async function loadPaths(): Promise<void> {
  pathsLoading.value = true;
  pathsError.value = null;
  try {
    const cfg = await fetchServerConfig();
    serverConfig.value = cfg;
    syncInputsFromConfig(cfg);
  } catch (err) {
    pathsError.value = err instanceof Error ? err.message : String(err);
  } finally {
    pathsLoading.value = false;
  }
}

async function savePaths(): Promise<void> {
  if (!canSavePaths.value) return;
  pathsSaving.value = true;
  pathsError.value = null;
  try {
    const patch = {
      ...(gameDirLocked.value ? {} : { gameDir: gameDirInput.value.trim() || null }),
      ...(screenshotsDirLocked.value
        ? {}
        : { screenshotsDir: screenshotsDirInput.value.trim() || null }),
    };
    const cfg = await putServerConfig(patch);
    serverConfig.value = cfg;
    syncInputsFromConfig(cfg);
    pathsJustSaved.value = true;
    setTimeout(() => {
      pathsJustSaved.value = false;
    }, 2_000);
  } catch (err) {
    pathsError.value = err instanceof Error ? err.message : String(err);
  } finally {
    pathsSaving.value = false;
  }
}

watch(open, (isOpen) => {
  if (isOpen && !serverConfig.value) void loadPaths();
});

onMounted(() => {
  window.addEventListener("resize", onResize);
  void loadPaths();
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
});

function sourceBadgeClass(source: "env" | "manual" | "detected" | "missing"): string {
  switch (source) {
    case "env":
      return "bg-sky-500/20 text-sky-200";
    case "manual":
      return "bg-emerald-500/20 text-emerald-200";
    case "detected":
      return "bg-neutral-500/20 text-neutral-200";
    case "missing":
      return "bg-rose-500/20 text-rose-200";
  }
}

function statusDotClass(slot: "gameDir" | "screenshotsDir" | "logsDir"): string {
  const item = serverConfig.value?.[slot];
  if (!item) return "bg-neutral-600";
  if (item.exists) return "bg-emerald-500";
  if (item.value) return "bg-amber-500";
  return "bg-rose-500";
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-neutral-200 backdrop-blur transition hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
      :aria-expanded="open"
      :aria-label="t.settings"
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
        class="fixed inset-x-3 bottom-16 z-[1010] rounded-xl border border-white/10 bg-neutral-900/95 p-4 text-sm text-neutral-100 shadow-2xl backdrop-blur sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-full sm:mb-2 sm:w-64"
        role="dialog"
        :aria-label="t.settings"
      >
        <div class="space-y-4">
          <section>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {{ t.language }}
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
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {{ t.paths.heading }}
            </h3>

            <p
              v-if="pathsError"
              class="mb-2 rounded-md bg-rose-900/40 px-2 py-1 text-xs text-rose-100"
            >
              {{ pathsError }}
            </p>
            <p v-if="pathsLoading && !serverConfig" class="text-xs text-neutral-400">…</p>

            <div v-if="serverConfig" class="space-y-3">
              <div>
                <div class="mb-1 flex items-center justify-between gap-2">
                  <label class="text-xs text-neutral-300" for="game-dir-input">
                    {{ t.paths.gameDir }}
                  </label>
                  <span
                    class="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                    :class="sourceBadgeClass(serverConfig.gameDir.source)"
                  >
                    {{ t.paths.source[serverConfig.gameDir.source] }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    :class="['h-2 w-2 rounded-full', statusDotClass('gameDir')]"
                    :title="
                      serverConfig.gameDir.exists ? '' : t.paths.missingTooltip
                    "
                    aria-hidden="true"
                  ></span>
                  <input
                    id="game-dir-input"
                    v-model="gameDirInput"
                    :placeholder="t.paths.placeholderGameDir"
                    :disabled="!isDesktop || gameDirLocked"
                    :readonly="!isDesktop"
                    class="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-100 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <p
                  class="mt-1 truncate text-[10px] text-neutral-500"
                  :title="serverConfig.logsDir.value ?? ''"
                >
                  {{ t.paths.logsDir }}: {{ serverConfig.logsDir.value ?? "—" }}
                </p>
              </div>

              <div>
                <div class="mb-1 flex items-center justify-between gap-2">
                  <label class="text-xs text-neutral-300" for="screenshots-dir-input">
                    {{ t.paths.screenshotsDir }}
                  </label>
                  <span
                    class="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                    :class="sourceBadgeClass(serverConfig.screenshotsDir.source)"
                  >
                    {{ t.paths.source[serverConfig.screenshotsDir.source] }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    :class="['h-2 w-2 rounded-full', statusDotClass('screenshotsDir')]"
                    :title="
                      serverConfig.screenshotsDir.exists ? '' : t.paths.missingTooltip
                    "
                    aria-hidden="true"
                  ></span>
                  <input
                    id="screenshots-dir-input"
                    v-model="screenshotsDirInput"
                    :placeholder="t.paths.placeholderScreenshotsDir"
                    :disabled="!isDesktop || screenshotsDirLocked"
                    :readonly="!isDesktop"
                    class="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-100 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <div v-if="isDesktop" class="flex items-center justify-end gap-2">
                <span v-if="pathsJustSaved" class="text-[10px] text-emerald-400">
                  {{ t.paths.saved }}
                </span>
                <button
                  type="button"
                  class="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-emerald-50 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                  :disabled="!canSavePaths"
                  @click="savePaths"
                >
                  {{ t.paths.save }}
                </button>
              </div>

              <p v-else class="text-[10px] leading-relaxed text-neutral-500">
                {{ t.paths.mobileHint }}
              </p>
            </div>
          </section>

          <section>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {{ t.map }}
            </h3>
            <select
              v-model="mapCode"
              class="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
            >
              <option v-for="code in MAP_CODES" :key="code" :value="code">
                {{ mapLabelFor(code) }}
              </option>
            </select>
          </section>

          <section>
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                {{ t.extracts }}
              </h3>
              <label class="inline-flex cursor-pointer items-center gap-2">
                <span class="text-xs text-neutral-300">{{ extractsVisible ? t.on : t.off }}</span>
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
                <span class="text-sm">{{ t.factions[opt.value] }}</span>
              </label>
            </div>

            <div
              class="mt-3 transition"
              :class="factionLabelDisabled ? 'opacity-40 pointer-events-none' : ''"
            >
              <p class="mb-1.5 text-xs text-neutral-400">{{ t.labels }}</p>
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
                  {{ opt === "hover" ? t.labelHover : t.labelSmart }}
                </label>
              </div>
              <p class="mt-1.5 text-[10px] leading-relaxed text-neutral-500">
                {{ t.labelHint }}
              </p>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </div>
</template>
