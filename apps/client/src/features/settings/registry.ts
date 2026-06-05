import { computed, shallowReactive, type ComputedRef, type Component } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { isTauri } from '@/shared/tauri';

export type SectionGroup = 'layers' | 'system';
export type SectionSubgroup = 'player' | 'loot' | 'quests';
export type SectionVisibility = 'always' | 'tauri' | 'desktop-or-tauri';

export interface SettingsSection {
  id: string;
  /** Top-level group: `layers` (what's drawn on the map) or `system`
   * (app/system preferences). */
  group: SectionGroup;
  /** Optional layer sub-bucket, surfaced as a non-interactive divider in the
   * drawer. Sections sharing a subgroup render contiguously under one label
   * (`player`/`loot`/`quests`). Omit for `map` (it sits at the top, ungrouped)
   * and for all `system` sections. A subgroup divider only appears once that
   * bucket has a visible section, so empty future buckets (loot/quests) stay
   * hidden until their layers ship. */
  subgroup?: SectionSubgroup;
  /** Ascending; use multiples of 10 so future insertions fit between existing entries.
   * Sort within a group is by `order`; keep same-subgroup sections contiguous.
   * layers: 10 map · 20 player, 30 extracts, 40 airdrop (subgroup `player`)
   * system: 10 overlay, 20 hotkeys, 30 language, 40 paths, 50 pairing */
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
