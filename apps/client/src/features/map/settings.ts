import { registerSettingsSection } from '@/features/settings/registry';
import MapSection from '@/features/settings/sections/MapSection.vue';
import ExtractsSection from '@/features/settings/sections/ExtractsSection.vue';
import PlayerSection from '@/features/settings/sections/PlayerSection.vue';

// Map sits at the top of the layers list, ungrouped — it's the base map
// selector, a prerequisite for every layer rather than a layer itself.
registerSettingsSection({
  id: 'map',
  group: 'layers',
  order: 10,
  titleKey: 'map',
  component: MapSection,
});
registerSettingsSection({
  id: 'player',
  group: 'layers',
  subgroup: 'player',
  order: 20,
  titleKey: 'position',
  component: PlayerSection,
});
registerSettingsSection({
  id: 'extracts',
  group: 'layers',
  subgroup: 'player',
  order: 30,
  titleKey: 'extracts',
  component: ExtractsSection,
});
