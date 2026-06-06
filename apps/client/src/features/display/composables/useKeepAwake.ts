import { isTauri } from '@/shared/tauri';
import { createNoSleepVideo, type NoSleepVideo } from './useNoSleepVideo';
import { useDisplayStore } from '../store';

// Keeps the screen awake while the map page is mounted. Two paths:
//   • Secure context (HTTPS / localhost): Screen Wake Lock API via VueUse,
//     auto-re-acquired on visibility return — no user gesture needed.
//   • Insecure LAN HTTP (the phone case): navigator.wakeLock is undefined, so
//     fall back to a muted looping <video> (nosleep.js). Video playback needs a
//     user gesture, so we arm a one-shot listener and start on the first tap.
// No-op under Tauri — the desktop overlay isn't a sleeping phone.
export function useKeepAwake(): void {
  if (isTauri) return;

  const store = useDisplayStore();
  const { keepAwake } = storeToRefs(store);
  const { isSupported, isActive, request, release } = useWakeLock();

  let noSleep: NoSleepVideo | null = null;
  let disarmGesture: (() => void) | null = null;
  // True once the video has actually played — gates re-play on visibility return
  // so we don't fire play() (which needs a gesture) before the first tap.
  let videoStarted = false;

  function startVideo(): void {
    noSleep ??= createNoSleepVideo();
    void noSleep
      .enable()
      .then(() => {
        videoStarted = true;
        store.keepAwakeActive = true;
      })
      .catch(() => {
        store.keepAwakeActive = false;
      });
  }

  function armGesture(): void {
    if (disarmGesture) return;
    store.keepAwakeMode = 'video';
    // removeEventListener takes no `passive` flag — match on type + listener.
    const remove = (): void => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('click', start);
      disarmGesture = null;
    };
    const start = (): void => {
      remove();
      startVideo();
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('click', start, { passive: true });
    disarmGesture = remove;
  }

  async function acquire(): Promise<void> {
    if (isSupported.value) {
      // VueUse's request() defers when the page is hidden and self-re-acquires
      // on visibility return, so call it regardless of current visibility.
      store.keepAwakeMode = 'wakelock';
      try {
        await request('screen');
      } catch {
        // Supported but denied (rare: low-power mode / permissions policy) — the
        // settings status reflects the not-holding state via keepAwakeActive.
      }
      store.keepAwakeActive = isActive.value;
      return;
    }
    // Video fallback needs a visible page and a user gesture to start.
    if (document.visibilityState === 'visible') armGesture();
  }

  async function releaseAll(): Promise<void> {
    disarmGesture?.();
    videoStarted = false;
    if (isActive.value) await release();
    noSleep?.disable();
    store.keepAwakeActive = false;
    store.keepAwakeMode = 'none';
  }

  // wakeLock path: VueUse re-acquires on visibility itself. Video path: the
  // <video> stays paused after the tab was hidden, so re-play on return — but
  // only once it has actually started (a hidden→visible transition has no user
  // gesture, so an un-started video can't begin here).
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (keepAwake.value && store.keepAwakeMode === 'video' && videoStarted) startVideo();
    } else if (store.keepAwakeMode === 'video') {
      store.keepAwakeActive = false;
    }
  });

  watch(keepAwake, (on) => {
    if (on) void acquire();
    else void releaseAll();
  });

  // Mirror VueUse's reactive isActive for the wakeLock path so the settings
  // status reflects OS-side drops / re-acquires.
  watch(isActive, (active) => {
    if (store.keepAwakeMode === 'wakelock') store.keepAwakeActive = active;
  });

  onMounted(() => {
    if (keepAwake.value) void acquire();
  });
  onScopeDispose(() => {
    void releaseAll();
  });
}
