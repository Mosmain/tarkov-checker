import { registerSettingsSection } from '@/features/settings/registry';
import OverlaySection from '@/features/settings/sections/OverlaySection.vue';
import PairingSection from '@/features/settings/sections/PairingSection.vue';

registerSettingsSection({
  id: 'overlay',
  order: 10,
  visible: 'tauri',
  titleKey: 'overlay.heading',
  component: OverlaySection,
});

// Pairing is a host-level action ("hand out QR to my phone"), not a per-overlay
// preference. Tauri-only — pairing_qr is an IPC command, and pairing yourself
// from a phone makes no sense.
registerSettingsSection({
  id: 'pairing',
  order: 50,
  visible: 'tauri',
  titleKey: 'pairing.heading',
  component: PairingSection,
});
