<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useMediaQuery } from "@vueuse/core";
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
import { FACTION_COLORS, VISIBLE_MAP_CODES } from "@shared/maps";
import { useUiText } from "../i18n";
import { useTauriOverlay } from "../composables/useTauriOverlay";
import { useServerPaths } from "../composables/useServerPaths";
import { useExtractsCacheControl } from "../composables/useExtractsCacheControl";
import { useOverlaySync } from "../composables/useOverlaySync";

const settings = useSettingsStore();
const {
  apiLang,
  extractFactions,
  extractLabelMode,
  extractLabelSize,
  playerFollow,
  mapCode,
  overlayAlwaysOnTop,
  overlayZoom,
  lockHotkey,
  zoomInHotkey,
  zoomOutHotkey,
  floorUpHotkey,
  floorDownHotkey,
} = storeToRefs(settings);
const t = useUiText();
const overlay = useTauriOverlay();

// Tarkov paths are unreachable from a phone over LAN (the browser can't see
// C:\EFT), but the Tauri overlay always runs on the same machine as Tarkov.
const isDesktop = useMediaQuery("(min-width: 640px)");
const canEditPaths = computed(() => overlay.isTauri || isDesktop.value);

const open = ref(false);

const {
  serverConfig,
  gameDirInput,
  screenshotsDirInput,
  pathsLoading,
  pathsSaving,
  pathsError,
  pathsJustSaved,
  gameDirLocked,
  screenshotsDirLocked,
  canSavePaths,
  loadPaths,
  savePaths,
  statusIconClass,
} = useServerPaths(canEditPaths);

const { mapLabelFor, cacheRefreshing, cacheError, cacheRelativeAge, refreshCache } =
  useExtractsCacheControl();

const { opacityPercent, mapOpacityPercent, mapOpacityDisabled } = useOverlaySync();

// Lazy fallback: if the eager load inside useServerPaths failed, retry the
// first time the drawer opens.
watch(open, (isOpen) => {
  if (isOpen && !serverConfig.value) void loadPaths();
});

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
  VISIBLE_MAP_CODES.map((code) => ({ value: code, label: mapLabelFor(code) })),
);
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
