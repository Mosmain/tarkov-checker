<script setup lang="ts">
import { useTauriOverlay } from '@/features/overlay/composables/useTauriOverlay';
import { useServerPaths } from '@/features/server/composables/useServerPaths';

const overlay = useTauriOverlay();
const { t } = useI18n();

const isDesktop = useMediaQuery('(min-width: 640px)');
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
  savePaths,
  statusIconClass,
} = useServerPaths(canEditPaths);
</script>

<template>
  <Fieldset :legend="t('paths.heading')">
    <Message
      v-if="pathsError"
      :severity="pathsError.kind === 'no-helper' ? 'warn' : 'error'"
      size="small"
      :closable="false"
    >
      <template v-if="pathsError.kind === 'no-helper'">
        <div class="text-xs font-medium">{{ t('paths.errors.noHelperTitle') }}</div>
        <p class="mt-1 text-[11px] leading-relaxed opacity-90">
          {{ t('paths.errors.noHelperBody') }}
        </p>
      </template>
      <template v-else>
        <div class="text-xs font-medium">{{ t('paths.errors.otherTitle') }}</div>
        <p class="mt-1 break-all text-[11px] leading-relaxed opacity-90">
          {{ pathsError.detail }}
        </p>
      </template>
    </Message>
    <p v-if="pathsLoading && !serverConfig" class="text-xs opacity-60">
      {{ t('paths.loading') }}
    </p>

    <div v-if="serverConfig" class="space-y-3">
      <div>
        <label class="mb-1 block text-xs opacity-70" for="game-dir-input">
          {{ t('paths.gameDir') }}
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
            @keyup.enter="canSavePaths && savePaths()"
          />
        </IconField>
      </div>

      <div>
        <label class="mb-1 block text-xs opacity-70" for="screenshots-dir-input">
          {{ t('paths.screenshotsDir') }}
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
            @keyup.enter="canSavePaths && savePaths()"
          />
        </IconField>
      </div>

      <div v-if="canEditPaths" class="flex items-center justify-end gap-2">
        <span v-if="pathsJustSaved" class="text-[11px] text-green-400">
          {{ t('paths.saved') }}
        </span>
        <Button
          :label="t('paths.save')"
          size="small"
          :disabled="!canSavePaths"
          :loading="pathsSaving"
          @click="savePaths"
        />
      </div>

      <p v-else class="text-[10px] leading-relaxed opacity-70">
        {{ t('paths.mobileHint') }}
      </p>
    </div>
  </Fieldset>
</template>
