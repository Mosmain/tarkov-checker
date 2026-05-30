<script setup lang="ts">
import { useSettingsSections } from './registry';

const { t } = useI18n();
const mainSections = useSettingsSections('main');
const systemSections = useSettingsSections('system');
const open = ref(false);
const isDesktop = useMediaQuery('(min-width: 640px)');
</script>

<template>
  <Button
    rounded
    severity="secondary"
    class="!bg-surface-800/80 hover:!bg-surface-800 !border-surface-700 backdrop-blur"
    :aria-label="t('settings')"
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
    :header="t('settings')"
    :class="isDesktop ? '!w-[26rem]' : ''"
  >
    <div class="space-y-4">
      <component :is="sec.component" v-for="sec in mainSections" :key="sec.id" />

      <div v-if="systemSections.length" class="pt-2 mt-2 border-t border-surface-700">
        <p class="mb-3 text-[10px] font-semibold uppercase tracking-wider opacity-70">
          {{ t('systemSection') }}
        </p>

        <div class="space-y-4">
          <component :is="sec.component" v-for="sec in systemSections" :key="sec.id" />
        </div>
      </div>
    </div>
  </Drawer>
</template>
