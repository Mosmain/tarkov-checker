import { registerMapLayer } from '../registry';
import { useExtractsLayer } from './useExtractsLayer';
import ExtractsSection from '@/features/settings/sections/ExtractsSection.vue';
import ExtractFactionFilter from '@/features/settings/sections/ExtractFactionFilter.vue';

registerMapLayer({
  id: 'extracts',
  mount: useExtractsLayer,
  category: 'player',
  order: 20,
  titleKey: 'extracts',
  settingsComponent: ExtractsSection,
  filterComponent: ExtractFactionFilter,
});
