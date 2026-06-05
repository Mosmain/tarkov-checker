import { registerSettingsSection } from '@/features/settings/registry';
import AirdropSection from '@/features/settings/sections/AirdropSection.vue';

registerSettingsSection({
  id: 'airdrop',
  group: 'layers',
  subgroup: 'player',
  order: 40,
  titleKey: 'airdrop.settingsHeading',
  component: AirdropSection,
});
