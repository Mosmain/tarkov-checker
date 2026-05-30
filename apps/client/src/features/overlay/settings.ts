import { registerSettingsSection } from '@/features/settings/registry';
import OverlaySection from '@/features/settings/sections/OverlaySection.vue';

registerSettingsSection({
  id: 'overlay',
  group: 'main',
  order: 50,
  visible: 'tauri',
  component: OverlaySection,
});
