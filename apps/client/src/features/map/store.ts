import { z } from "zod";
import { TARKOV_MAPS, type TarkovMapCode } from "@shared/maps";
import { persistedRef } from "../../shared/persisted-store";
import type { PlayerFollow } from "./composables/usePlayerMarker";

const extractFactionSchema = z.enum(["pmc", "scav", "shared"]);
const labelModeSchema = z.enum(["hover", "always"]);
const labelSizeSchema = z.enum(["sm", "md", "lg"]);
const playerFollowSchema = z.enum(["off", "sm", "md", "lg"]);
const mapCodeSchema = z.string().refine((s): s is TarkovMapCode => s in TARKOV_MAPS);

export type ExtractFactionFilter = z.infer<typeof extractFactionSchema>;
export type ExtractLabelMode = z.infer<typeof labelModeSchema>;
export type ExtractLabelSize = z.infer<typeof labelSizeSchema>;

const DEFAULT_FACTIONS: readonly ExtractFactionFilter[] = ["pmc", "scav", "shared"];

export const useMapSettingsStore = defineStore("map-settings", () => {
  const mapCode = persistedRef("tc.map.code", mapCodeSchema, "bigmap" as TarkovMapCode);
  const extractFactions = persistedRef(
    "tc.map.extractFactions",
    z.array(extractFactionSchema),
    [...DEFAULT_FACTIONS],
  );
  const extractLabelMode = persistedRef(
    "tc.map.extractLabelMode",
    labelModeSchema,
    "always" as ExtractLabelMode,
  );
  const extractLabelSize = persistedRef(
    "tc.map.extractLabelSize",
    labelSizeSchema,
    "md" as ExtractLabelSize,
  );
  const playerFollow = persistedRef(
    "tc.map.playerFollow",
    playerFollowSchema,
    "off" as PlayerFollow,
  );

  return { mapCode, extractFactions, extractLabelMode, extractLabelSize, playerFollow };
});
