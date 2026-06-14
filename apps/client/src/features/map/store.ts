import { z } from 'zod';
import { TARKOV_MAPS, type TarkovMapCode } from '@shared/maps';
import { persistedRef } from '@/shared/persisted-store';
import type { PlayerFollow } from './layers/player/usePlayerLayer';

const extractFactionSchema = z.enum(['pmc', 'scav', 'shared', 'transit']);
const labelModeSchema = z.enum(['hover', 'always']);
const labelSizeSchema = z.enum(['sm', 'md', 'lg']);
const playerFollowSchema = z.enum(['off', 'on']);
const mapCodeSchema = z.string().refine((s): s is TarkovMapCode => s in TARKOV_MAPS);
const autoMapSwitchSchema = z.boolean();

export type ExtractFactionFilter = z.infer<typeof extractFactionSchema>;
export type ExtractLabelMode = z.infer<typeof labelModeSchema>;
export type ExtractLabelSize = z.infer<typeof labelSizeSchema>;

const DEFAULT_FACTIONS: readonly ExtractFactionFilter[] = ['pmc', 'scav', 'shared', 'transit'];

export const useMapSettingsStore = defineStore('map-settings', () => {
  const mapCode = persistedRef('rm.map.code', mapCodeSchema, 'bigmap' as TarkovMapCode);
  const extractFactions = persistedRef('rm.map.extractFactions', z.array(extractFactionSchema), [
    ...DEFAULT_FACTIONS,
  ]);
  const extractLabelMode = persistedRef(
    'rm.map.extractLabelMode',
    labelModeSchema,
    'always' as ExtractLabelMode,
  );
  const extractLabelSize = persistedRef(
    'rm.map.extractLabelSize',
    labelSizeSchema,
    'md' as ExtractLabelSize,
  );
  // Off-screen extract arrows on the viewport edge. Opt-in, off by default.
  const edgeIndicators = persistedRef('rm.map.edgeIndicators', z.boolean(), false);
  const playerFollow = persistedRef(
    'rm.map.playerFollow',
    playerFollowSchema,
    'off' as PlayerFollow,
  );
  const autoMapSwitch = persistedRef('rm.map.autoMapSwitch', autoMapSwitchSchema, true);

  return {
    mapCode,
    extractFactions,
    extractLabelMode,
    extractLabelSize,
    edgeIndicators,
    playerFollow,
    autoMapSwitch,
  };
});
