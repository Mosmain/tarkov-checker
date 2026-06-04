<script setup lang="ts">
import { z } from 'zod';
import { useSettingsSections } from './registry';
import { persistedRef } from '@/shared/persisted-store';

const { t } = useI18n();
const layersSections = useSettingsSections('layers');
const settingsSections = useSettingsSections('settings');
const open = ref(false);
const isDesktop = useMediaQuery('(min-width: 640px)');

// Only surface a tab that actually has visible sections — e.g. on a phone the
// Settings tab keeps just Language, while overlay/hotkeys/paths/pairing are
// desktop/overlay-only and filtered out by the registry.
const tabs = computed(() =>
  [
    { value: 'layers', label: t('settingsTabs.layers'), sections: layersSections.value },
    { value: 'settings', label: t('settingsTabs.settings'), sections: settingsSections.value },
  ].filter((tab) => tab.sections.length > 0),
);

const activeTab = persistedRef('tc.settings.tab', z.enum(['layers', 'settings']), 'layers');

// Expanded accordion panels per tab. Desktop opens every section by default so
// all controls are visible at a glance; on a phone they start collapsed to keep
// the drawer short. The default is snapshotted once from the section ids — after
// that the user's expand/collapse choices persist.
const openLayers = persistedRef(
  'tc.settings.open.layers',
  z.array(z.string()),
  isDesktop.value ? layersSections.value.map((s) => s.id) : [],
);
const openSettings = persistedRef(
  'tc.settings.open.settings',
  z.array(z.string()),
  isDesktop.value ? settingsSections.value.map((s) => s.id) : [],
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

  <!-- Non-modal so the map stays bright and live behind the drawer: toggling a
       layer (extracts, labels, follow, edge arrows) is previewed in real time.
       Mobile uses a bottom-sheet (auto height, capped) that hugs its content so
       the map peeks above it; desktop keeps the right-side panel. -->
  <Drawer
    v-model:visible="open"
    :modal="false"
    :dismissable="false"
    :position="isDesktop ? 'right' : 'bottom'"
    :header="t('settings')"
    :class="isDesktop ? '!w-[26rem]' : '!h-auto !max-h-[85dvh] !rounded-t-2xl'"
  >
    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab v-for="tab in tabs" :key="tab.value" :value="tab.value">{{ tab.label }}</Tab>
      </TabList>
      <TabPanels class="!px-0">
        <TabPanel value="layers" class="!px-0 !pb-0">
          <Accordion v-model:value="openLayers" multiple>
            <AccordionPanel v-for="sec in layersSections" :key="sec.id" :value="sec.id">
              <AccordionHeader>{{ t(sec.titleKey) }}</AccordionHeader>
              <AccordionContent>
                <component :is="sec.component" />
              </AccordionContent>
            </AccordionPanel>
          </Accordion>
        </TabPanel>
        <TabPanel value="settings" class="!px-0 !pb-0">
          <Accordion v-model:value="openSettings" multiple>
            <AccordionPanel v-for="sec in settingsSections" :key="sec.id" :value="sec.id">
              <AccordionHeader>{{ t(sec.titleKey) }}</AccordionHeader>
              <AccordionContent>
                <component :is="sec.component" />
              </AccordionContent>
            </AccordionPanel>
          </Accordion>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </Drawer>
</template>
