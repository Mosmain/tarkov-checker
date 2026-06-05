<script setup lang="ts">
import { z } from 'zod';
import { useSettingsSections } from './registry';
import { persistedRef } from '@/shared/persisted-store';

const { t } = useI18n();
const systemSections = useSettingsSections('system');
const open = ref(false);
const isDesktop = useMediaQuery('(min-width: 640px)');

// System/app settings only. Map layers moved out of the drawer onto the on-map
// LayerRail; the gear now holds the rare config (overlay/hotkeys/language/
// paths/pairing). Desktop opens every section; the overlay/phone start
// collapsed to keep the sheet short. Snapshotted once, then user choices persist.
const openSections = persistedRef(
  'tc.settings.open',
  z.array(z.string()),
  isDesktop.value ? systemSections.value.map((s) => s.id) : [],
);
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

  <!-- System/app config only — map layers live on the on-map LayerRail now.
       Non-modal so the map stays live behind it; bottom-sheet on the overlay/
       phone, right-side panel on desktop. -->
  <Drawer
    v-model:visible="open"
    :modal="false"
    :dismissable="false"
    :position="isDesktop ? 'right' : 'bottom'"
    :header="t('settings')"
    :class="isDesktop ? '!w-[26rem]' : '!h-auto !max-h-[85dvh] !rounded-t-2xl'"
  >
    <Accordion v-model:value="openSections" multiple>
      <AccordionPanel v-for="sec in systemSections" :key="sec.id" :value="sec.id">
        <AccordionHeader>{{ t(sec.titleKey) }}</AccordionHeader>
        <AccordionContent>
          <component :is="sec.component" />
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </Drawer>
</template>
