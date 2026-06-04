import { registerSettingsSection } from '@/features/settings/registry';
import AirdropSection from '@/features/settings/sections/AirdropSection.vue';

registerSettingsSection({
  id: 'airdrop',
  group: 'layers',
  order: 40,
  visible: 'tauri',
  titleKey: 'airdrop.settingsHeading',
  component: AirdropSection,
});
