import { registerSettingsSection } from '@/features/settings/registry';
import HotkeysSection from '@/features/settings/sections/HotkeysSection.vue';

registerSettingsSection({
  id: 'hotkeys',
  group: 'main',
  order: 60,
  // Shown on the desktop browser + overlay (both have a keyboard), hidden on
  // phones. The browser uses the same combos via useBrowserShortcut.
  visible: 'desktop-or-tauri',
  component: HotkeysSection,
});
