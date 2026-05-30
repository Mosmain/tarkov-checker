import { registerSettingsSection } from '@/features/settings/registry';
import AirdropSection from '@/features/settings/sections/AirdropSection.vue';

registerSettingsSection({
  id: 'airdrop',
  group: 'main',
  order: 40,
  visible: 'tauri',
  component: AirdropSection,
});
