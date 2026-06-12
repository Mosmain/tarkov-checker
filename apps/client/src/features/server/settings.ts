import { registerSettingsSection } from '@/features/settings/registry';
import PathsSection from '@/features/settings/sections/PathsSection.vue';

registerSettingsSection({
  id: 'paths',
  order: 40,
  // 'always': phones get the read-only view (PathsSection's canEditPaths) —
  // path status is useful for diagnostics, editing stays desktop/Tauri-only.
  visible: 'always',
  titleKey: 'paths.heading',
  component: PathsSection,
});
