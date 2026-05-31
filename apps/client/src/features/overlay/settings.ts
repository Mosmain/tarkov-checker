import { registerSettingsSection } from '@/features/settings/registry';
import OverlaySection from '@/features/settings/sections/OverlaySection.vue';
import PairingSection from '@/features/settings/sections/PairingSection.vue';

registerSettingsSection({
  id: 'overlay',
  group: 'main',
  order: 50,
  visible: 'tauri',
  component: OverlaySection,
});

// Pairing lives in system: it's a host-level action ("hand out QR to my
// phone"), not a per-overlay preference. Tauri-only — pairing_qr is an
// IPC command, and pairing yourself from a phone makes no sense.
registerSettingsSection({
  id: 'pairing',
  group: 'system',
  order: 30,
  visible: 'tauri',
  component: PairingSection,
});
