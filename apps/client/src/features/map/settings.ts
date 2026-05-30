import { registerSettingsSection } from '@/features/settings/registry';
import MapSection from '@/features/settings/sections/MapSection.vue';
import ExtractsSection from '@/features/settings/sections/ExtractsSection.vue';
import PlayerSection from '@/features/settings/sections/PlayerSection.vue';

registerSettingsSection({ id: 'map', group: 'main', order: 10, component: MapSection });
registerSettingsSection({ id: 'extracts', group: 'main', order: 20, component: ExtractsSection });
registerSettingsSection({ id: 'player', group: 'main', order: 30, component: PlayerSection });
