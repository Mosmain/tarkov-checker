import { registerMapLayer } from '../registry';
import { usePlayerLayer } from './usePlayerLayer';
import PlayerSection from '@/features/settings/sections/PlayerSection.vue';

registerMapLayer({
  id: 'player',
  mount: usePlayerLayer,
  category: 'player',
  order: 10,
  titleKey: 'position',
  settingsComponent: PlayerSection,
});
