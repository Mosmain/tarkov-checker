import { registerSettingsSection } from '@/features/settings/registry';
import DisplaySection from './components/DisplaySection.vue';

// Browser/phone-only display prefs (fullscreen, keep-awake). Meaningless in the
// frameless Tauri overlay, so gated to non-Tauri via the 'browser' visibility.
registerSettingsSection({
  id: 'display',
  order: 25,
  visible: 'browser',
  titleKey: 'display.heading',
  component: DisplaySection,
});
