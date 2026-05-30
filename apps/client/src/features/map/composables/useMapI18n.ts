import { TARKOV_MAPS, type TarkovMapCode } from '@shared/maps';

export interface UseMapI18n {
  /**
   * Localized name for a map code. Falls back to the English `displayName`
   * from `@shared/maps` when the locale has no translation yet — so a
   * freshly-added map still renders something legible before locale files
   * catch up.
   */
  localizedMapName: (code: TarkovMapCode) => string;
}

/**
 * Shared localization helper for map names. The `te → t → displayName`
 * fallback used to be duplicated in `MapView.vue` and `MapSection.vue`;
 * unify it here so changes (e.g. adding a third fallback step) land in
 * one place.
 */
export function useMapI18n(): UseMapI18n {
  const { t, te } = useI18n();

  function localizedMapName(code: TarkovMapCode): string {
    const key = `mapNames.${code}`;
    return te(key) ? t(key) : TARKOV_MAPS[code].displayName;
  }

  return { localizedMapName };
}
