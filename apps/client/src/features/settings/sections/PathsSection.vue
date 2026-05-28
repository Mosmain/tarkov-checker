<script setup lang="ts">
import { useTauriOverlay } from "@/features/overlay/composables/useTauriOverlay";
import { useServerPaths } from "@/features/server/composables/useServerPaths";

const props = defineProps<{
  /** Toggled by the parent drawer. Used as a retry trigger when the eager
   *  initial load inside useServerPaths failed. */
  drawerOpen: boolean;
}>();

const overlay = useTauriOverlay();
const { t } = useI18n();

// Tarkov paths are unreachable from a phone over LAN (the browser can't see
// C:\EFT), but the Tauri overlay always runs on the same machine as Tarkov.
const isDesktop = useMediaQuery("(min-width: 640px)");
const canEditPaths = computed(() => overlay.isTauri || isDesktop.value);

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

watch(
  () => props.drawerOpen,
  (isOpen) => {
    if (isOpen && !serverConfig.value) void loadPaths();
  },
);
</script>

<template>
  <Fieldset :legend="t('paths.heading')">
    <Message v-if="pathsError" severity="error" size="small" :closable="false">
      {{ pathsError }}
    </Message>
    <p v-if="pathsLoading && !serverConfig" class="text-xs opacity-60">…</p>

    <div v-if="serverConfig" class="space-y-3">
      <div>
        <label class="mb-1 block text-xs opacity-70" for="game-dir-input">
          {{ t("paths.gameDir") }}
        </label>
        <IconField :title="serverConfig.gameDir.exists ? '' : t('paths.missingTooltip')">
          <InputIcon :class="statusIconClass('gameDir')" />
          <InputText
            id="game-dir-input"
            v-model="gameDirInput"
            :placeholder="t('paths.placeholderGameDir')"
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
          {{ t("paths.logsDir") }}: {{ serverConfig.logsDir.value ?? "—" }}
        </p>
      </div>

      <div>
        <label class="mb-1 block text-xs opacity-70" for="screenshots-dir-input">
          {{ t("paths.screenshotsDir") }}
        </label>
        <IconField :title="serverConfig.screenshotsDir.exists ? '' : t('paths.missingTooltip')">
          <InputIcon :class="statusIconClass('screenshotsDir')" />
          <InputText
            id="screenshots-dir-input"
            v-model="screenshotsDirInput"
            :placeholder="t('paths.placeholderScreenshotsDir')"
            :disabled="!canEditPaths || screenshotsDirLocked"
            :readonly="!canEditPaths"
            size="small"
            fluid
          />
        </IconField>
      </div>

      <div v-if="canEditPaths" class="flex items-center justify-end gap-2">
        <span v-if="pathsJustSaved" class="text-[11px] text-green-400">
          {{ t("paths.saved") }}
        </span>
        <Button
          :label="t('paths.save')"
          size="small"
          :disabled="!canSavePaths"
          :loading="pathsSaving"
          @click="savePaths"
        />
      </div>

      <p v-else class="text-[10px] leading-relaxed opacity-50">
        {{ t("paths.mobileHint") }}
      </p>
    </div>
  </Fieldset>
</template>
