<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import Drawer from "primevue/drawer";
import Button from "primevue/button";
import Fieldset from "primevue/fieldset";
import Select from "primevue/select";
import InputText from "primevue/inputtext";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import Checkbox from "primevue/checkbox";
import Message from "primevue/message";
import SelectButton from "primevue/selectbutton";
import ToggleSwitch from "primevue/toggleswitch";
import Slider from "primevue/slider";
import HotkeyRecorder from "./HotkeyRecorder.vue";
import { useSettingsStore, type ExtractFactionFilter } from "../stores/settings";
import { FACTION_COLORS, TARKOV_MAPS, VISIBLE_MAP_CODES, type TarkovMapCode } from "@shared/maps";
import type { ServerConfigResponse } from "@shared/config-api";
import { useUiText } from "../i18n";
import { useTauriOverlay } from "../composables/useTauriOverlay";
import {
  fetchAllExtracts,
  getCacheTimestamp,
  refreshExtracts,
} from "../api/tarkov-dev";
import { fetchServerConfig, putServerConfig } from "../api/server-config";

const settings = useSettingsStore();
const {
  apiLang,
  extractFactions,
  extractLabelMode,
  extractLabelSize,
  playerFollow,
  mapCode,
  overlayAlwaysOnTop,
  overlayOpacity,
  overlayMapOpacity,
  overlayZoom,
  lockHotkey,
  zoomInHotkey,
  zoomOutHotkey,
  floorUpHotkey,
  floorDownHotkey,
} = storeToRefs(settings);
const t = useUiText();

const overlay = useTauriOverlay();

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

const langOptions = computed(() => [
  { label: "EN", value: "en" as const },
  { label: "RU", value: "ru" as const },
]);

const overlayZoomOptions = computed(() => [
  { label: "75%", value: "75" as const },
  { label: "100%", value: "100" as const },
  { label: "125%", value: "125" as const },
  { label: "150%", value: "150" as const },
]);

// Slider works in 30-100 range (integer %); convert to/from 0.3-1.0 float.
const opacityPercent = computed<number>({
  get: () => Math.round(overlayOpacity.value * 100),
  set: (pct) => {
    overlayOpacity.value = Math.max(30, Math.min(100, pct)) / 100;
  },
});

// Map-background opacity goes all the way to 0 — the user can disable the
// solid surface behind the map entirely and see only the SVG + markers.
const mapOpacityPercent = computed<number>({
  get: () => Math.round(overlayMapOpacity.value * 100),
  set: (pct) => {
    overlayMapOpacity.value = Math.max(0, Math.min(100, pct)) / 100;
  },
});

// Slider is disabled at full overlay opacity — a transparent map background
// behind a fully opaque overlay would just look like a hole in the UI, not
// the intended "see desktop through the app" effect.
const mapOpacityDisabled = computed(() => overlayOpacity.value >= 1);

// The CSS variable on <html> drives `.leaflet-container`'s alpha channel.
// When the overall opacity is at 100% we force the map back to fully opaque
// regardless of the stored value — keeps the visual model consistent with
// the disabled-slider hint.
function applyMapBgAlpha(): void {
  const effective = overlayOpacity.value < 1 ? overlayMapOpacity.value : 1;
  document.documentElement.style.setProperty("--map-bg-alpha", String(effective));
}
applyMapBgAlpha();
watch([overlayOpacity, overlayMapOpacity], applyMapBgAlpha);

// Apply current overlay settings to the Tauri window on mount + on every change.
// Click-through state is owned by App.vue (driven by lock button + global hotkey),
// not by this drawer, so we don't touch it here.
function syncOverlay(): void {
  if (!overlay.isTauri) return;
  void overlay.setAlwaysOnTop(overlayAlwaysOnTop.value);
  void overlay.setOpacity(overlayOpacity.value);
  void overlay.setZoom(Number(overlayZoom.value) / 100);
}

if (overlay.isTauri) {
  syncOverlay();
  watch(overlayAlwaysOnTop, (v) => void overlay.setAlwaysOnTop(v));
  watch(overlayOpacity, (v) => void overlay.setOpacity(v));
  watch(overlayZoom, (v) => void overlay.setZoom(Number(v) / 100));
}

// Hotkey recording UI lives in <HotkeyRecorder>; each instance binds to its
// own store ref. App.vue picks up changes via useGlobalShortcut composables
// and re-registers with Tauri accordingly.

const labelModeOptions = computed(() => [
  { label: t.value.labelHover, value: "hover" as const },
  { label: t.value.labelAlways, value: "always" as const },
]);

const labelSizeOptions = computed(() => [
  { label: t.value.labelSizes.sm, value: "sm" as const },
  { label: t.value.labelSizes.md, value: "md" as const },
  { label: t.value.labelSizes.lg, value: "lg" as const },
]);

const playerFollowOptions = computed(() => [
  { label: t.value.playerFollowOptions.off, value: "off" as const },
  { label: t.value.playerFollowOptions.sm, value: "sm" as const },
  { label: t.value.playerFollowOptions.md, value: "md" as const },
  { label: t.value.playerFollowOptions.lg, value: "lg" as const },
]);

const mapOptions = computed(() =>
  MAP_CODES.map((code) => ({ value: code, label: mapLabelFor(code) })),
);

const SM_BREAKPOINT = 640;
const isDesktop = ref(typeof window !== "undefined" ? window.innerWidth >= SM_BREAKPOINT : true);
function onResize(): void {
  isDesktop.value = window.innerWidth >= SM_BREAKPOINT;
}

// Tarkov paths are unreachable from a phone connected over LAN (the browser
// can't see `C:\EFT`), but the Tauri overlay runs on the same machine as
// Tarkov regardless of how narrow the window is — always allow editing there.
const canEditPaths = computed(() => overlay.isTauri || isDesktop.value);

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
  () => canEditPaths.value && !pathsSaving.value && (gameDirDirty.value || screenshotsDirDirty.value),
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

function statusIconClass(slot: "gameDir" | "screenshotsDir" | "logsDir"): string {
  const item = serverConfig.value?.[slot];
  if (!item) return "pi pi-circle text-surface-500";
  if (item.exists) return "pi pi-check-circle text-green-500";
  if (item.value) return "pi pi-exclamation-circle text-amber-400";
  return "pi pi-times-circle text-red-500";
}
</script>

<template>
  <Button
    rounded
    severity="secondary"
    class="!bg-surface-800/80 hover:!bg-surface-800 !border-surface-700 backdrop-blur"
    :aria-label="t.settings"
    :aria-expanded="open"
    @click="open = true"
  >
    <template #icon>
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
    </template>
  </Button>

  <Drawer
    v-model:visible="open"
    :position="isDesktop ? 'right' : 'full'"
    :header="t.settings"
    :class="isDesktop ? '!w-[26rem]' : ''"
  >
    <div class="space-y-4">
      <Fieldset :legend="t.map">
        <Select
          v-model="mapCode"
          :options="mapOptions"
          option-label="label"
          option-value="value"
          fluid
        />
      </Fieldset>

      <Fieldset :legend="t.extracts">
        <div class="flex flex-col gap-1">
          <label
            v-for="opt in FACTION_OPTIONS"
            :key="opt.value"
            class="flex cursor-pointer items-center gap-3 rounded px-1 py-1 hover:bg-surface-800"
          >
            <Checkbox
              v-model="extractFactions"
              :value="opt.value"
              :input-id="'faction-' + opt.value"
            />
            <i
              class="pi pi-circle-fill text-xs"
              :style="{ color: opt.color }"
              aria-hidden="true"
            />
            <span class="text-sm">{{ t.factions[opt.value] }}</span>
          </label>
        </div>

        <div class="mt-3">
          <p class="mb-1.5 text-xs opacity-60">{{ t.labels }}</p>
          <SelectButton
            v-model="extractLabelMode"
            :options="labelModeOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            size="small"
            class="w-full"
          />
          <p class="mt-1.5 text-[10px] leading-relaxed opacity-50">{{ t.labelHint }}</p>
        </div>

        <div class="mt-3">
          <p class="mb-1.5 text-xs opacity-60">{{ t.labelSize }}</p>
          <SelectButton
            v-model="extractLabelSize"
            :options="labelSizeOptions"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            size="small"
            class="w-full"
          />
        </div>
      </Fieldset>

      <Fieldset :legend="t.player">
        <p class="mb-1.5 text-xs opacity-60">{{ t.playerFollow }}</p>
        <SelectButton
          v-model="playerFollow"
          :options="playerFollowOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          class="w-full"
        />
        <p class="mt-1.5 text-[10px] leading-relaxed opacity-50">{{ t.playerFollowHint }}</p>
      </Fieldset>

      <Fieldset v-if="overlay.isTauri" :legend="t.overlay.heading">
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <label class="text-sm" for="overlay-always-on-top">{{ t.overlay.alwaysOnTop }}</label>
            <ToggleSwitch v-model="overlayAlwaysOnTop" input-id="overlay-always-on-top" />
          </div>

          <div>
            <div class="mb-1.5 flex items-center justify-between gap-3">
              <label class="text-xs opacity-70" for="overlay-opacity">{{ t.overlay.opacity }}</label>
              <span class="text-xs tabular-nums opacity-70">{{ opacityPercent }}%</span>
            </div>
            <Slider
              v-model="opacityPercent"
              :min="30"
              :max="100"
              :step="5"
              input-id="overlay-opacity"
              class="w-full"
            />
          </div>

          <div :class="mapOpacityDisabled ? 'opacity-50' : ''">
            <div class="mb-1.5 flex items-center justify-between gap-3">
              <label class="text-xs opacity-70" for="overlay-map-opacity">
                {{ t.overlay.mapOpacity }}
              </label>
              <span class="text-xs tabular-nums opacity-70">{{ mapOpacityPercent }}%</span>
            </div>
            <Slider
              v-model="mapOpacityPercent"
              :min="0"
              :max="100"
              :step="5"
              :disabled="mapOpacityDisabled"
              input-id="overlay-map-opacity"
              class="w-full"
            />
            <p
              v-if="mapOpacityDisabled"
              class="mt-1.5 text-[10px] leading-relaxed opacity-50"
            >
              {{ t.overlay.mapOpacityHint }}
            </p>
          </div>

          <div>
            <p class="mb-1.5 text-xs opacity-60">{{ t.overlay.zoom }}</p>
            <SelectButton
              v-model="overlayZoom"
              :options="overlayZoomOptions"
              option-label="label"
              option-value="value"
              :allow-empty="false"
              size="small"
              class="w-full"
            />
          </div>
        </div>
      </Fieldset>

      <Fieldset v-if="overlay.isTauri" :legend="t.hotkeys.heading">
        <div class="space-y-3">
          <HotkeyRecorder v-model="lockHotkey" :label="t.hotkeys.lock" />
          <HotkeyRecorder v-model="zoomInHotkey" :label="t.hotkeys.zoomIn" />
          <HotkeyRecorder v-model="zoomOutHotkey" :label="t.hotkeys.zoomOut" />
          <HotkeyRecorder v-model="floorUpHotkey" :label="t.hotkeys.floorUp" />
          <HotkeyRecorder v-model="floorDownHotkey" :label="t.hotkeys.floorDown" />
          <p class="text-[10px] leading-relaxed opacity-50">{{ t.hotkeys.lockHint }}</p>
        </div>
      </Fieldset>

      <Fieldset :legend="t.cache.heading">
        <div class="flex items-center justify-between gap-2">
          <div class="text-xs opacity-70">
            {{ t.cache.lastUpdated }}: <span class="opacity-100">{{ cacheRelativeAge }}</span>
          </div>
          <Button
            :label="cacheRefreshing ? t.cache.refreshing : t.cache.refresh"
            size="small"
            severity="secondary"
            outlined
            :loading="cacheRefreshing"
            :disabled="cacheRefreshing"
            @click="refreshCache"
          />
        </div>
        <Message v-if="cacheError" severity="error" size="small" :closable="false" class="mt-2">
          {{ cacheError }}
        </Message>
        <p class="mt-2 text-[10px] leading-relaxed opacity-50">{{ t.cache.hint }}</p>
      </Fieldset>

      <div class="pt-2 mt-2 border-t border-surface-700">
        <p class="mb-3 text-[10px] font-semibold uppercase tracking-wider opacity-50">
          {{ t.systemSection }}
        </p>

        <div class="space-y-4">
          <Fieldset :legend="t.language">
            <SelectButton
              v-model="apiLang"
              :options="langOptions"
              option-label="label"
              option-value="value"
              :allow-empty="false"
              aria-label="API language"
              class="w-full"
            />
          </Fieldset>

          <Fieldset :legend="t.paths.heading">
            <Message v-if="pathsError" severity="error" size="small" :closable="false">
              {{ pathsError }}
            </Message>
            <p v-if="pathsLoading && !serverConfig" class="text-xs opacity-60">…</p>

            <div v-if="serverConfig" class="space-y-3">
              <div>
                <label class="mb-1 block text-xs opacity-70" for="game-dir-input">
                  {{ t.paths.gameDir }}
                </label>
                <IconField :title="serverConfig.gameDir.exists ? '' : t.paths.missingTooltip">
                  <InputIcon :class="statusIconClass('gameDir')" />
                  <InputText
                    id="game-dir-input"
                    v-model="gameDirInput"
                    :placeholder="t.paths.placeholderGameDir"
                    :disabled="!canEditPaths || gameDirLocked"
                    :readonly="!canEditPaths"
                    size="small"
                    fluid
                  />
                </IconField>
                <p
                  class="mt-1 truncate text-[10px] opacity-50"
                  :title="serverConfig.logsDir.value ?? ''"
                >
                  {{ t.paths.logsDir }}: {{ serverConfig.logsDir.value ?? "—" }}
                </p>
              </div>

              <div>
                <label class="mb-1 block text-xs opacity-70" for="screenshots-dir-input">
                  {{ t.paths.screenshotsDir }}
                </label>
                <IconField
                  :title="serverConfig.screenshotsDir.exists ? '' : t.paths.missingTooltip"
                >
                  <InputIcon :class="statusIconClass('screenshotsDir')" />
                  <InputText
                    id="screenshots-dir-input"
                    v-model="screenshotsDirInput"
                    :placeholder="t.paths.placeholderScreenshotsDir"
                    :disabled="!canEditPaths || screenshotsDirLocked"
                    :readonly="!canEditPaths"
                    size="small"
                    fluid
                  />
                </IconField>
              </div>

              <div v-if="canEditPaths" class="flex items-center justify-end gap-2">
                <span v-if="pathsJustSaved" class="text-[11px] text-green-400">
                  {{ t.paths.saved }}
                </span>
                <Button
                  :label="t.paths.save"
                  size="small"
                  :disabled="!canSavePaths"
                  :loading="pathsSaving"
                  @click="savePaths"
                />
              </div>

              <p v-else class="text-[10px] leading-relaxed opacity-50">
                {{ t.paths.mobileHint }}
              </p>
            </div>
          </Fieldset>
        </div>
      </div>
    </div>
  </Drawer>
</template>
