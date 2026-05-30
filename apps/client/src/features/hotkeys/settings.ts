import { registerSettingsSection } from '@/features/settings/registry';
import HotkeysSection from '@/features/settings/sections/HotkeysSection.vue';

registerSettingsSection({
  id: 'hotkeys',
  group: 'main',
  order: 60,
  visible: 'tauri',
  component: HotkeysSection,
});
