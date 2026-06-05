import { registerMapLayer } from '../registry';
import { useAirdropLayer } from './useAirdropLayer';
import AirdropSection from '@/features/settings/sections/AirdropSection.vue';

registerMapLayer({
  id: 'airdrop',
  mount: useAirdropLayer,
  category: 'player',
  order: 30,
  titleKey: 'airdrop.settingsHeading',
  settingsComponent: AirdropSection,
});
