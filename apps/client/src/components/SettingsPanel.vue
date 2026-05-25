<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useSettingsStore, type ExtractFactionFilter } from "../stores/settings";
import { FACTION_COLORS, TARKOV_MAPS, VISIBLE_MAP_CODES, type TarkovMapCode } from "@shared/maps";
import type { ServerConfigResponse } from "@shared/config-api";
import { useUiText } from "../i18n";
import {
  fetchAllExtracts,
  getCacheTimestamp,
  refreshExtracts,
} from "../api/tarkov-dev";
import { fetchServerConfig, putServerConfig } from "../api/server-config";

const settings = useSettingsStore();
const { apiLang, extractFactions, extractLabelMode, mapCode } = storeToRefs(settings);
const t = useUiText();

const MAP_CODES = VISIBLE_MAP_CODES;
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
  } finally {
    refreshCacheTimestamp();
  }
}

void loadMapNames();
watch(apiLang, () => void loadMapNames());

function mapLabelFor(code: TarkovMapCode): string {
  return localizedMapNames.value[code.toLowerCase()] ?? TARKOV_MAPS[code].displayName;
}

const open = ref(false);

const FACTION_OPTIONS: ReadonlyArray<{
  value: ExtractFactionFilter;
  color: string;
}> = [
  { value: "pmc", color: FACTION_COLORS.pmc },
  { value: "scav", color: FACTION_COLORS.scav },
  { value: "shared", color: FACTION_COLORS.shared },
];

function close(): void {
  open.value = false;
}
function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape" && open.value) close();
}
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));

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

const gameDirLocked = computed(() => serverConfig.value?.gameDir.source === "env");
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
  () => isDesktop.value && !pathsSaving.value && (gameDirDirty.value || screenshotsDirDirty.value),
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

const cacheTimestamp = ref<number | null>(null);
const cacheRefreshing = ref(false);
const cacheError = ref<string | null>(null);

function refreshCacheTimestamp(): void {
  cacheTimestamp.value = getCacheTimestamp(apiLang.value);
}
refreshCacheTimestamp();
watch(apiLang, refreshCacheTimestamp);

async function refreshCache(): Promise<void> {
  cacheRefreshing.value = true;
  cacheError.value = null;
  try {
    await refreshExtracts(apiLang.value);
    refreshCacheTimestamp();
  } catch (err) {
    cacheError.value = err instanceof Error ? err.message : String(err);
  } finally {
    cacheRefreshing.value = false;
  }
}

const cacheRelativeAge = computed(() => {
  const ts = cacheTimestamp.value;
  if (!ts) return t.value.cache.never;
  const ms = Date.now() - ts;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
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
      return "badge-info";
    case "manual":
      return "badge-success";
    case "detected":
      return "badge-ghost";
    case "missing":
      return "badge-error";
  }
}

function statusDotClass(slot: "gameDir" | "screenshotsDir" | "logsDir"): string {
  const item = serverConfig.value?.[slot];
  if (!item) return "bg-base-content/30";
  if (item.exists) return "bg-success";
  if (item.value) return "bg-warning";
  return "bg-error";
}
</script>

<template>
  <button
    type="button"
    class="btn btn-sm btn-circle btn-ghost bg-base-300/80 hover:bg-base-300 backdrop-blur"
    :aria-label="t.settings"
    :aria-expanded="open"
    @click="open = true"
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

  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        aria-hidden="true"
        class="fixed inset-0 z-[2000] bg-black/40"
        @click="close"
      />
    </Transition>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="open"
        class="fixed inset-y-0 right-0 z-[2010] w-full sm:w-96 max-w-full bg-base-200 shadow-2xl overflow-y-auto"
        role="dialog"
        :aria-label="t.settings"
      >
        <div
          class="sticky top-0 z-10 flex items-center justify-between bg-base-200 px-4 py-3 border-b border-base-300"
        >
          <h2 class="text-sm font-semibold uppercase tracking-wider opacity-70">
            {{ t.settings }}
          </h2>
          <button
            type="button"
            class="btn btn-sm btn-ghost btn-circle"
            :aria-label="'Close'"
            @click="close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div class="space-y-4 p-4">
          <fieldset class="fieldset bg-base-100 border border-base-300 rounded-box p-3">
            <legend class="fieldset-legend text-xs font-semibold uppercase tracking-wider">
              {{ t.language }}
            </legend>
            <div class="join w-full">
              <label
                v-for="opt in (['en', 'ru'] as const)"
                :key="opt"
                class="join-item btn btn-sm flex-1 shadow-none"
                :class="apiLang === opt ? 'btn-primary' : 'btn-outline'"
              >
                <input v-model="apiLang" type="radio" :value="opt" name="api-lang" class="sr-only" />
                {{ opt.toUpperCase() }}
              </label>
            </div>
          </fieldset>

          <fieldset class="fieldset bg-base-100 border border-base-300 rounded-box p-3 space-y-3">
            <legend class="fieldset-legend text-xs font-semibold uppercase tracking-wider">
              {{ t.paths.heading }}
            </legend>

            <div v-if="pathsError" class="alert alert-error alert-sm text-xs">{{ pathsError }}</div>
            <p v-if="pathsLoading && !serverConfig" class="text-xs opacity-60">…</p>

            <div v-if="serverConfig" class="space-y-3">
              <div>
                <div class="mb-1 flex items-center justify-between gap-2">
                  <label class="text-xs opacity-70" for="game-dir-input">
                    {{ t.paths.gameDir }}
                  </label>
                  <span class="badge badge-sm" :class="sourceBadgeClass(serverConfig.gameDir.source)">
                    {{ t.paths.source[serverConfig.gameDir.source] }}
                  </span>
                </div>
                <label
                  class="input input-sm input-bordered bg-base-200 flex items-center gap-2"
                  :title="serverConfig.gameDir.exists ? '' : t.paths.missingTooltip"
                >
                  <span
                    class="inline-block h-2 w-2 rounded-full"
                    :class="statusDotClass('gameDir')"
                    aria-hidden="true"
                  ></span>
                  <input
                    id="game-dir-input"
                    v-model="gameDirInput"
                    :placeholder="t.paths.placeholderGameDir"
                    :disabled="!isDesktop || gameDirLocked"
                    :readonly="!isDesktop"
                    class="grow text-xs"
                  />
                </label>
                <p
                  class="mt-1 truncate text-[10px] opacity-50"
                  :title="serverConfig.logsDir.value ?? ''"
                >
                  {{ t.paths.logsDir }}: {{ serverConfig.logsDir.value ?? "—" }}
                </p>
              </div>

              <div>
                <div class="mb-1 flex items-center justify-between gap-2">
                  <label class="text-xs opacity-70" for="screenshots-dir-input">
                    {{ t.paths.screenshotsDir }}
                  </label>
                  <span
                    class="badge badge-sm"
                    :class="sourceBadgeClass(serverConfig.screenshotsDir.source)"
                  >
                    {{ t.paths.source[serverConfig.screenshotsDir.source] }}
                  </span>
                </div>
                <label
                  class="input input-sm input-bordered bg-base-200 flex items-center gap-2"
                  :title="serverConfig.screenshotsDir.exists ? '' : t.paths.missingTooltip"
                >
                  <span
                    class="inline-block h-2 w-2 rounded-full"
                    :class="statusDotClass('screenshotsDir')"
                    aria-hidden="true"
                  ></span>
                  <input
                    id="screenshots-dir-input"
                    v-model="screenshotsDirInput"
                    :placeholder="t.paths.placeholderScreenshotsDir"
                    :disabled="!isDesktop || screenshotsDirLocked"
                    :readonly="!isDesktop"
                    class="grow text-xs"
                  />
                </label>
              </div>

              <div v-if="isDesktop" class="flex items-center justify-end gap-2">
                <span v-if="pathsJustSaved" class="text-[11px] text-success">
                  {{ t.paths.saved }}
                </span>
                <button
                  type="button"
                  class="btn btn-primary btn-sm shadow-none"
                  :disabled="!canSavePaths"
                  @click="savePaths"
                >
                  {{ t.paths.save }}
                </button>
              </div>

              <p v-else class="text-[10px] leading-relaxed opacity-50">{{ t.paths.mobileHint }}</p>
            </div>
          </fieldset>

          <fieldset class="fieldset bg-base-100 border border-base-300 rounded-box p-3">
            <legend class="fieldset-legend text-xs font-semibold uppercase tracking-wider">
              {{ t.map }}
            </legend>
            <select v-model="mapCode" class="select select-bordered select-sm bg-base-200 w-full">
              <option v-for="code in MAP_CODES" :key="code" :value="code">
                {{ mapLabelFor(code) }}
              </option>
            </select>
          </fieldset>

          <fieldset class="fieldset bg-base-100 border border-base-300 rounded-box p-3 space-y-3">
            <legend class="fieldset-legend text-xs font-semibold uppercase tracking-wider">
              {{ t.extracts }}
            </legend>

            <div class="flex flex-col gap-1">
              <label
                v-for="opt in FACTION_OPTIONS"
                :key="opt.value"
                class="flex cursor-pointer items-center gap-3 rounded px-1 py-1 hover:bg-base-200"
              >
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm checkbox-primary"
                  :checked="extractFactions.includes(opt.value)"
                  @change="settings.toggleFaction(opt.value)"
                />
                <span
                  class="inline-block h-2.5 w-2.5 rounded-full"
                  :style="{ backgroundColor: opt.color }"
                  aria-hidden="true"
                ></span>
                <span class="text-sm">{{ t.factions[opt.value] }}</span>
              </label>
            </div>

            <div>
              <p class="mb-1.5 text-xs opacity-60">{{ t.labels }}</p>
              <div class="join w-full">
                <label
                  v-for="opt in (['hover', 'always'] as const)"
                  :key="opt"
                  class="join-item btn btn-xs flex-1 shadow-none"
                  :class="extractLabelMode === opt ? 'btn-primary' : 'btn-outline'"
                >
                  <input
                    v-model="extractLabelMode"
                    type="radio"
                    :value="opt"
                    name="label-mode"
                    class="sr-only"
                  />
                  {{ opt === "hover" ? t.labelHover : t.labelAlways }}
                </label>
              </div>
              <p class="mt-1.5 text-[10px] leading-relaxed opacity-50">{{ t.labelHint }}</p>
            </div>
          </fieldset>

          <fieldset class="fieldset bg-base-100 border border-base-300 rounded-box p-3 space-y-2">
            <legend class="fieldset-legend text-xs font-semibold uppercase tracking-wider">
              {{ t.cache.heading }}
            </legend>
            <div class="flex items-center justify-between gap-2">
              <div class="text-xs opacity-70">
                {{ t.cache.lastUpdated }}: <span class="opacity-100">{{ cacheRelativeAge }}</span>
              </div>
              <button
                type="button"
                class="btn btn-sm shadow-none"
                :class="cacheRefreshing ? 'btn-disabled' : 'btn-outline'"
                :disabled="cacheRefreshing"
                @click="refreshCache"
              >
                {{ cacheRefreshing ? t.cache.refreshing : t.cache.refresh }}
              </button>
            </div>
            <div v-if="cacheError" class="alert alert-error alert-sm text-xs">{{ cacheError }}</div>
            <p class="text-[10px] leading-relaxed opacity-50">{{ t.cache.hint }}</p>
          </fieldset>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
