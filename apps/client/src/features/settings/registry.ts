import { computed, shallowReactive, type ComputedRef, type Component } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { isTauri } from '@/shared/tauri';

export type SectionVisibility = 'always' | 'tauri' | 'desktop-or-tauri' | 'browser';

export interface SettingsSection {
  id: string;
  /** Ascending; use multiples of 10 so future insertions fit between entries. */
  order: number;
  /** i18n key for the accordion header label (the section title). */
  titleKey: string;
  visible?: SectionVisibility;
  /** Sync `Component` or `defineAsyncComponent(() => import('...'))`. */
  component: Component;
}

// System/app settings only (the gear drawer). Map layers self-describe their
// own settings via the map-layer registry now — this registry no longer carries
// any layer concept (no groups/subgroups).
const registry = shallowReactive(new Map<string, SettingsSection>());

// HMR-safe: replace existing entry instead of duplicating on hot-reload.
export function registerSettingsSection(s: SettingsSection): void {
  registry.set(s.id, s);
}

export function useSettingsSections(): ComputedRef<SettingsSection[]> {
  const isDesktop = useMediaQuery('(min-width: 640px)');

  return computed(() => {
    const visible = (v: SectionVisibility = 'always'): boolean => {
      if (v === 'always') return true;
      if (v === 'tauri') return isTauri;
      if (v === 'browser') return !isTauri;
      return isTauri || isDesktop.value;
    };

    return [...registry.values()]
      .filter((s) => visible(s.visible))
      .sort((a, b) => a.order - b.order);
  });
}
