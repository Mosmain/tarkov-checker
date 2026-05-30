import { registerSettingsSection } from '@/features/settings/registry';
import LanguageSection from '@/features/settings/sections/LanguageSection.vue';

registerSettingsSection({ id: 'language', group: 'system', order: 10, component: LanguageSection });
