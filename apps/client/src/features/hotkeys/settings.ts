import { registerSettingsSection } from '@/features/settings/registry';
import HotkeysSection from '@/features/settings/sections/HotkeysSection.vue';

registerSettingsSection({
  id: 'hotkeys',
  group: 'system',
  order: 20,
  // Shown on the desktop browser + overlay (both have a keyboard), hidden on
  // phones. The combos are backend-owned now — configurable from any desktop
  // browser, fired globally for every client via the `command` event.
  visible: 'desktop-or-tauri',
  titleKey: 'hotkeys.heading',
  component: HotkeysSection,
});
