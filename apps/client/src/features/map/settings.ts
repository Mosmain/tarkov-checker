import { registerSettingsSection } from '@/features/settings/registry';
import MapSection from '@/features/settings/sections/MapSection.vue';
import ExtractsSection from '@/features/settings/sections/ExtractsSection.vue';
import PlayerSection from '@/features/settings/sections/PlayerSection.vue';

registerSettingsSection({
  id: 'map',
  group: 'layers',
  order: 10,
  titleKey: 'map',
  component: MapSection,
});
registerSettingsSection({
  id: 'extracts',
  group: 'layers',
  order: 20,
  titleKey: 'extracts',
  component: ExtractsSection,
});
registerSettingsSection({
  id: 'player',
  group: 'layers',
  order: 30,
  titleKey: 'player',
  component: PlayerSection,
});
