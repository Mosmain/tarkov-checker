import { z } from 'zod';
import { persistedRef } from '@/shared/persisted-store';

export type KeepAwakeMode = 'wakelock' | 'video' | 'none';

export const useDisplayStore = defineStore('display', () => {
  // Keep the phone screen awake while the map is open. Default on — the map is
  // a passive second screen, so sleeping mid-raid is the common annoyance.
  const keepAwake = persistedRef('tc.display.keepAwake', z.boolean(), true);

  // Runtime status of the keep-awake driver (not persisted) — read by the
  // settings UI to show which path holds the lock and whether it's active.
  const keepAwakeMode = ref<KeepAwakeMode>('none');
  const keepAwakeActive = ref(false);

  return { keepAwake, keepAwakeMode, keepAwakeActive };
});
