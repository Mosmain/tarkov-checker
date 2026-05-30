interface TarkovMapInfo {
  readonly displayName: string;
  readonly svgFile: string;
  /**
   * In-game (x, z) bounds, in the same format tarkov-dev keeps them
   * (`[[x1, z1], [x2, z2]]`, not normalized to min/max). Consumers should
   * normalize when building Leaflet latLngBounds.
   */
  readonly bounds: readonly [readonly [number, number], readonly [number, number]];
  /** `[scaleX, offsetX, scaleY, offsetY]` — feed to L.Transformation with -scaleY. */
  readonly transform: readonly [number, number, number, number];
  /** Degrees, counter-clockwise; applied during CRS projection. */
  readonly rotation: number;
  /**
   * Optional per-map offset (degrees) added to the player-yaw arrow on top of
   * `rotation`. Use when in-game position calibration is correct but the
   * screenshot-derived yaw is rotated relative to the rendered map (e.g. BSG
   * re-oriented the level's world axes without changing extract coordinates,
   * as happened for Factory in patch 1.0.5.0). Defaults to 0.
   */
  readonly yawOffset?: number;
  /** Top-level `<g>` group id in the SVG that acts as the base ground layer. */
  readonly svgLayer: string | null;
  /**
   * Non-null when this entry is an alias of another map (same SVG, different
   * Tarkov nameId). Hide aliases from selectors; keep them in the table so
   * raw log nameIds like `factory4_night` still resolve. Canonical entries
   * have null.
   */
  readonly canonical: string | null;
  /**
   * Ordered top-to-bottom list of floors for the floor switcher. Each `id`
   * matches a top-level <g> element in the SVG; `label` is the numeric tag
   * shown in the UI (e.g. "-1", "0", "1"). Empty array means the map is
   * single-level and the switcher should be hidden.
   */
  readonly floors: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  /** Floor id to show on first render. Null only when `floors` is empty. */
  readonly defaultFloor: string | null;
}

export const TARKOV_MAPS = {
  bigmap: {
    displayName: 'Customs',
    svgFile: 'Customs.svg',
    bounds: [
      [698, -307],
      [-372, 237],
    ],
    transform: [0.239, 168.65, 0.239, 136.35],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: null,
    floors: [
      { id: 'Third_Floor', label: '3' },
      { id: 'Second_Floor', label: '2' },
      { id: 'First_Floor', label: '1' },
      { id: 'Ground_Level', label: '0' },
      { id: 'Underground_Level', label: '-1' },
    ],
    defaultFloor: 'Ground_Level',
  },
  factory4_day: {
    displayName: 'Factory',
    svgFile: 'Factory.svg',
    bounds: [
      [77, -64.5],
      [-65.5, 67.4],
    ],
    transform: [1.629, 119.9, 1.629, 139.3],
    rotation: 90,
    // Patch 1.0.5.0 re-oriented the in-game world axes on Factory by 180°
    // without changing extract coordinates: marker positions stayed correct
    // but the screenshot quaternion's yaw started pointing in the opposite
    // direction. Compensate per-map without touching `rotation` (which would
    // also shift positions). Confirmed live 2026-05-30 on PvE practice.
    yawOffset: 180,
    svgLayer: 'Ground_Floor',
    canonical: null,
    floors: [
      { id: 'Third_Floor', label: '2' },
      { id: 'Second_Floor', label: '1' },
      { id: 'Ground_Floor', label: '0' },
      { id: 'Basement', label: '-1' },
    ],
    defaultFloor: 'Ground_Floor',
  },
  factory4_night: {
    displayName: 'Factory (Night)',
    svgFile: 'Factory.svg',
    bounds: [
      [77, -64.5],
      [-65.5, 67.4],
    ],
    transform: [1.629, 119.9, 1.629, 139.3],
    rotation: 90,
    yawOffset: 180,
    svgLayer: 'Ground_Floor',
    canonical: 'factory4_day',
    floors: [
      { id: 'Third_Floor', label: '2' },
      { id: 'Second_Floor', label: '1' },
      { id: 'Ground_Floor', label: '0' },
      { id: 'Basement', label: '-1' },
    ],
    defaultFloor: 'Ground_Floor',
  },
  // 1.0.5.0 rcid rename. BSG dropped the legacy "Factory 4" numbering in the
  // scene preset bundle while keeping `factory4_day` as the internal Location
  // id in the [Transit] line. Verified live on 2026-05-30.
  factory_day: {
    displayName: 'Factory',
    svgFile: 'Factory.svg',
    bounds: [
      [77, -64.5],
      [-65.5, 67.4],
    ],
    transform: [1.629, 119.9, 1.629, 139.3],
    rotation: 90,
    yawOffset: 180,
    svgLayer: 'Ground_Floor',
    canonical: 'factory4_day',
    floors: [
      { id: 'Third_Floor', label: '2' },
      { id: 'Second_Floor', label: '1' },
      { id: 'Ground_Floor', label: '0' },
      { id: 'Basement', label: '-1' },
    ],
    defaultFloor: 'Ground_Floor',
  },
  // Predicted alias for the renamed night variant — not yet observed live,
  // but extrapolated from the factory_day rename. Cheap to keep; if the
  // prediction is wrong the entry just goes unused.
  factory_night: {
    displayName: 'Factory (Night)',
    svgFile: 'Factory.svg',
    bounds: [
      [77, -64.5],
      [-65.5, 67.4],
    ],
    transform: [1.629, 119.9, 1.629, 139.3],
    rotation: 90,
    yawOffset: 180,
    svgLayer: 'Ground_Floor',
    canonical: 'factory4_day',
    floors: [
      { id: 'Third_Floor', label: '2' },
      { id: 'Second_Floor', label: '1' },
      { id: 'Ground_Floor', label: '0' },
      { id: 'Basement', label: '-1' },
    ],
    defaultFloor: 'Ground_Floor',
  },
  woods: {
    displayName: 'Woods',
    svgFile: 'Woods.svg',
    bounds: [
      [646, -914],
      [-761, 442],
    ],
    transform: [0.1855, 112.95, 0.1855, 167.85],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: null,
    floors: [],
    defaultFloor: null,
  },
  shoreline: {
    displayName: 'Shoreline',
    svgFile: 'Shoreline.svg',
    bounds: [
      [504, -415],
      [-1056, 618],
    ],
    transform: [0.16, 83.2, 0.16, 111.1],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: null,
    floors: [
      { id: 'Third_Floor', label: '3' },
      { id: 'Second_Floor', label: '2' },
      { id: 'First_Floor', label: '1' },
      { id: 'Ground_Level', label: '0' },
      { id: 'Underground_Level', label: '-1' },
    ],
    defaultFloor: 'Ground_Level',
  },
  rezervbase: {
    displayName: 'Reserve',
    svgFile: 'Reserve.svg',
    bounds: [
      [289, -293],
      [-303, 244],
    ],
    transform: [0.395, 122, 0.395, 137.65],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: null,
    floors: [
      { id: 'Ground_Level', label: '0' },
      { id: 'Bunkers', label: '-1' },
    ],
    defaultFloor: 'Ground_Level',
  },
  // 1.0.5.0 rcid rename. BSG shipped `Rezerv_Base` (PascalCase + underscore)
  // in the scene preset bundle; lowercased here so the parser's normalised
  // output (`rezerv_base`) resolves. The [Transit] line still emits the
  // legacy `RezervBase` → `rezervbase` canonical. Verified live 2026-05-30.
  rezerv_base: {
    displayName: 'Reserve',
    svgFile: 'Reserve.svg',
    bounds: [
      [289, -293],
      [-303, 244],
    ],
    transform: [0.395, 122, 0.395, 137.65],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: 'rezervbase',
    floors: [
      { id: 'Ground_Level', label: '0' },
      { id: 'Bunkers', label: '-1' },
    ],
    defaultFloor: 'Ground_Level',
  },
  // 1.0.5.0 rcid uses `Shopping_Mall.ScenesPreset.asset` — PascalCase plus
  // the plural "Scenes" (one-off vs. every other map's `scenespreset`). The
  // parser is case-insensitive so the lowercase form lands here. Bundle file
  // is just `shopping_mall.bundle` (no `_preset` suffix either). Verified
  // live 2026-05-30; the [Transit] line still emits the legacy `Interchange`
  // canonical, so this alias plus the parser fix cover both ingestion paths.
  shopping_mall: {
    displayName: 'Interchange',
    svgFile: 'Interchange.svg',
    bounds: [
      [598, -442],
      [-433, 426],
    ],
    transform: [0.265, 150.6, 0.265, 134.6],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: 'interchange',
    floors: [
      { id: 'Fourth_Floor', label: '4' },
      { id: 'Third_Floor', label: '3' },
      { id: 'Second_Floor', label: '2' },
      { id: 'First_Floor', label: '1' },
      { id: 'Ground_Level', label: '0' },
      { id: 'Parking_Level', label: '-1' },
    ],
    defaultFloor: 'Ground_Level',
  },
  interchange: {
    displayName: 'Interchange',
    svgFile: 'Interchange.svg',
    bounds: [
      [598, -442],
      [-433, 426],
    ],
    transform: [0.265, 150.6, 0.265, 134.6],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: null,
    floors: [
      { id: 'Second_Floor', label: '2' },
      { id: 'First_Floor', label: '1' },
      { id: 'Ground_Level', label: '0' },
    ],
    defaultFloor: 'Ground_Level',
  },
  lighthouse: {
    displayName: 'Lighthouse',
    svgFile: 'Lighthouse.svg',
    bounds: [
      [515, -998],
      [-545, 725],
    ],
    transform: [0.2, 0, 0.2, 0],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: null,
    floors: [],
    defaultFloor: null,
  },
  tarkovstreets: {
    displayName: 'Streets of Tarkov',
    svgFile: 'StreetsOfTarkov.svg',
    bounds: [
      [323, -295],
      [-280, 532],
    ],
    transform: [0.38, 0, 0.38, 0],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: null,
    floors: [
      { id: 'Fifth_Floor', label: '5' },
      { id: 'Fourth_Floor', label: '4' },
      { id: 'Third_Floor', label: '3' },
      { id: 'Second_Floor', label: '2' },
      { id: 'First_Floor', label: '1' },
      { id: 'Ground_Level', label: '0' },
      { id: 'Underground_Level', label: '-1' },
    ],
    defaultFloor: 'Ground_Level',
  },
  // 1.0.5.0 rcid rename. BSG shipped just `city` in the scene preset bundle
  // (`city_preset.bundle`); `[Transit] Locations:TarkovStreets` still carries
  // the legacy canonical id. Verified live 2026-05-30.
  city: {
    displayName: 'Streets of Tarkov',
    svgFile: 'StreetsOfTarkov.svg',
    bounds: [
      [323, -295],
      [-280, 532],
    ],
    transform: [0.38, 0, 0.38, 0],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: 'tarkovstreets',
    floors: [
      { id: 'Fifth_Floor', label: '5' },
      { id: 'Fourth_Floor', label: '4' },
      { id: 'Third_Floor', label: '3' },
      { id: 'Second_Floor', label: '2' },
      { id: 'First_Floor', label: '1' },
      { id: 'Ground_Level', label: '0' },
      { id: 'Underground_Level', label: '-1' },
    ],
    defaultFloor: 'Ground_Level',
  },
  laboratory: {
    displayName: 'The Lab',
    svgFile: 'Labs.svg',
    bounds: [
      [-80, -477],
      [-287, -193],
    ],
    transform: [0.575, 281.2, 0.575, 193.7],
    rotation: 270,
    svgLayer: null,
    canonical: null,
    floors: [
      { id: 'Second_Level', label: '1' },
      { id: 'First_Level', label: '0' },
      { id: 'Technical_Level', label: '-1' },
    ],
    defaultFloor: 'First_Level',
  },
  sandbox: {
    displayName: 'Ground Zero',
    svgFile: 'GroundZero.svg',
    bounds: [
      [249, -124],
      [-99, 364],
    ],
    transform: [0.524, 167.3, 0.524, 65.1],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: null,
    floors: [
      { id: 'Third_Floor', label: '3' },
      { id: 'Second_Floor', label: '2' },
      { id: 'First_Floor', label: '1' },
      { id: 'Ground_Level', label: '0' },
      { id: 'Underground_Level', label: '-1' },
    ],
    defaultFloor: 'Ground_Level',
  },
  sandbox_high: {
    displayName: 'Ground Zero (High)',
    svgFile: 'GroundZero.svg',
    bounds: [
      [249, -124],
      [-99, 364],
    ],
    transform: [0.524, 167.3, 0.524, 65.1],
    rotation: 180,
    svgLayer: 'Ground_Level',
    canonical: 'sandbox',
    floors: [
      { id: 'Third_Floor', label: '3' },
      { id: 'Second_Floor', label: '2' },
      { id: 'First_Floor', label: '1' },
      { id: 'Ground_Level', label: '0' },
      { id: 'Underground_Level', label: '-1' },
    ],
    defaultFloor: 'Ground_Level',
  },
} as const satisfies Record<string, TarkovMapInfo>;

export type TarkovMapCode = keyof typeof TARKOV_MAPS;
export type TarkovMapName = (typeof TARKOV_MAPS)[TarkovMapCode]['displayName'];

export function isKnownMapCode(code: string): code is TarkovMapCode {
  return Object.prototype.hasOwnProperty.call(TARKOV_MAPS, code);
}

export function mapInfo(code: TarkovMapCode): TarkovMapInfo {
  return TARKOV_MAPS[code];
}

export function mapDisplayName(code: string): TarkovMapName | 'Unknown' {
  return isKnownMapCode(code) ? TARKOV_MAPS[code].displayName : 'Unknown';
}

export function mapSvgPath(code: TarkovMapCode, basePath = '/maps'): string {
  return `${basePath}/${TARKOV_MAPS[code].svgFile}`;
}

/**
 * Resolve a raw Tarkov map code to its canonical variant — e.g. when a log
 * line surfaces `factory4_night` we still want to render the Factory SVG
 * via the `factory4_day` entry. Returns the input unchanged for canonicals
 * and for unknown codes.
 */
export function canonicalMapCode(code: string): TarkovMapCode | string {
  if (!isKnownMapCode(code)) return code;
  return TARKOV_MAPS[code].canonical ?? code;
}

/** Map codes that should appear in user-facing pickers (canonicals only). */
export const VISIBLE_MAP_CODES = (Object.keys(TARKOV_MAPS) as TarkovMapCode[]).filter(
  (code) => TARKOV_MAPS[code].canonical === null,
);

export const FACTION_COLORS = {
  pmc: '#22c55e',
  scav: '#eab308',
  shared: '#3b82f6',
} as const satisfies Record<string, string>;

export type FactionKey = keyof typeof FACTION_COLORS;
