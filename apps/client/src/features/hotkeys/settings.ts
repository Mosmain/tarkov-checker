import { registerSettingsSection } from '@/features/settings/registry';
import HotkeysSection from '@/features/settings/sections/HotkeysSection.vue';

registerSettingsSection({
  id: 'hotkeys',
  order: 20,
  // Shown everywhere — the combos are backend-owned and fire globally, so the
  // bindings are worth seeing on any client. Rebinding needs a keyboard, so
  // the rows go read-only on a phone (see HotkeysSection); the overlay + desktop
  // browser stay editable.
  visible: 'always',
  titleKey: 'hotkeys.heading',
  component: HotkeysSection,
});
