import { NO_SLEEP_WEBM, NO_SLEEP_MP4 } from '../assets/noSleepVideo';

export interface NoSleepVideo {
  /** Must be called from a user gesture for the first play; muted playback may
   *  resume programmatically afterwards (e.g. after the tab was hidden). */
  enable: () => Promise<void>;
  disable: () => void;
}

// Keep-awake fallback for insecure (HTTP) origins where the Screen Wake Lock API
// is unavailable: a muted, looping, off-screen <video>. Browsers won't sleep the
// display while a video plays. Self-contained — no third-party runtime dep.
export function createNoSleepVideo(): NoSleepVideo {
  let video: HTMLVideoElement | null = null;

  function ensure(): HTMLVideoElement {
    if (video) return video;
    const el = document.createElement('video');
    el.setAttribute('title', 'No Sleep');
    el.setAttribute('playsinline', '');
    el.muted = true;
    el.loop = true;
    // WebM first (Android/desktop), MP4 second (iOS Safari plays only MP4). The
    // browser picks the first source it can decode.
    for (const [type, src] of [
      ['video/webm', NO_SLEEP_WEBM],
      ['video/mp4', NO_SLEEP_MP4],
    ] as const) {
      const source = document.createElement('source');
      source.type = type;
      source.src = src;
      el.appendChild(source);
    }
    // Off-screen, non-interactive. Attaching to the DOM is more reliable than a
    // detached element across browsers.
    el.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
    video = el;
    return el;
  }

  return {
    enable: () => ensure().play(),
    disable: () => video?.pause(),
  };
}
