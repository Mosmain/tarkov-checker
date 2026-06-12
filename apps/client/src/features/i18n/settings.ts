import { registerSettingsSection } from '@/features/settings/registry';
import LanguageSection from '@/features/settings/sections/LanguageSection.vue';

registerSettingsSection({
  id: 'language',
  order: 30,
  titleKey: 'language',
  component: LanguageSection,
});
