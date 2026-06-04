import { computed, shallowReactive, type ComputedRef, type Component } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { isTauri } from '@/shared/tauri';

export type SectionGroup = 'layers' | 'settings';
export type SectionVisibility = 'always' | 'tauri' | 'desktop-or-tauri';

export interface SettingsSection {
  id: string;
  /** Which drawer tab the section lives under: `layers` (what's drawn on the
   * map) or `settings` (app/system preferences). */
  group: SectionGroup;
  /** Ascending; use multiples of 10 so future insertions fit between existing entries.
   * layers: 10 map, 20 extracts, 30 player, 40 airdrop
   * settings: 10 overlay, 20 hotkeys, 30 language, 40 paths, 50 pairing */
  order: number;
  /** i18n key for the accordion header label (the section title). */
  titleKey: string;
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
