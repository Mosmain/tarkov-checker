import { registerSettingsSection } from '@/features/settings/registry';
import PathsSection from '@/features/settings/sections/PathsSection.vue';

registerSettingsSection({
  id: 'paths',
  order: 40,
  visible: 'desktop-or-tauri',
  titleKey: 'paths.heading',
  component: PathsSection,
});
