import { computed, shallowReactive, type ComputedRef, type Component } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { isTauri } from '@/shared/tauri';

export type SectionGroup = 'main' | 'system';
export type SectionVisibility = 'always' | 'tauri' | 'desktop-or-tauri';

export interface SettingsSection {
  id: string;
  group: SectionGroup;
  /** Ascending; use multiples of 10 so future insertions fit between existing entries.
   * main: 10 map, 20 extracts, 30 player, 40 airdrop, 50 overlay, 60 hotkeys
   * system: 10 language, 20 paths */
  order: number;
  visible?: SectionVisibility;
  /** Sync `Component` or `defineAsyncComponent(() => import('...'))` —
   *  Vue resolves both. */
  component: Component;
}

// shallowReactive so `useSettingsSections`'s computed re-tracks on
// registerSettingsSection during dev HMR (or any future late registration).
// Plain Map mutations would otherwise go unnoticed by Vue's tracker.
const registry = shallowReactive(new Map<string, SettingsSection>());

// HMR-safe: replace existing entry instead of duplicating on hot-reload.
export function registerSettingsSection(s: SettingsSection): void {
  registry.set(s.id, s);
}

export function useSettingsSections(group: SectionGroup): ComputedRef<SettingsSection[]> {
  const isDesktop = useMediaQuery('(min-width: 640px)');

  return computed(() => {
    const visible = (v: SectionVisibility = 'always'): boolean => {
      if (v === 'always') return true;
      if (v === 'tauri') return isTauri;
      return isTauri || isDesktop.value;
    };

    return [...registry.values()]
      .filter((s) => s.group === group && visible(s.visible))
      .sort((a, b) => a.order - b.order);
  });
}
