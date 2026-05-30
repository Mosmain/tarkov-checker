import type { TransportStatus } from './useServerTransport';

const TransportStatusKey: InjectionKey<Ref<TransportStatus>> = Symbol('TransportStatus');

/**
 * App-root provides the live transport status; route views read it via
 * `useTransportStatus()`. Keeps the transport singleton mounted in App.vue
 * while leaving the status pill free to live in any route's chrome.
 */
export function provideTransportStatus(status: Ref<TransportStatus>): void {
  provide(TransportStatusKey, status);
}

export function useTransportStatus(): Ref<TransportStatus> {
  return inject(TransportStatusKey, ref<TransportStatus>('connecting'));
}
