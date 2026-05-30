import { registerSettingsSection } from '@/features/settings/registry';
import PathsSection from '@/features/settings/sections/PathsSection.vue';

registerSettingsSection({
  id: 'paths',
  group: 'system',
  order: 20,
  visible: 'desktop-or-tauri',
  component: PathsSection,
});
