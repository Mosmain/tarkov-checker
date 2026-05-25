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
  /** Top-level `<g>` group id in the SVG that acts as the base ground layer. */
  readonly svgLayer: string | null;
}

export const TARKOV_MAPS = {
  bigmap: {
    displayName: "Customs",
    svgFile: "Customs.svg",
    bounds: [
      [698, -307],
      [-372, 237],
    ],
    transform: [0.239, 168.65, 0.239, 136.35],
    rotation: 180,
    svgLayer: "Ground_Level",
  },
  factory4_day: {
    displayName: "Factory (Day)",
    svgFile: "Factory.svg",
    bounds: [
      [77, -64.5],
      [-65.5, 67.4],
    ],
    transform: [1.629, 119.9, 1.629, 139.3],
    rotation: 90,
    svgLayer: "Ground_Floor",
  },
  factory4_night: {
    displayName: "Factory (Night)",
    svgFile: "Factory.svg",
    bounds: [
      [77, -64.5],
      [-65.5, 67.4],
    ],
    transform: [1.629, 119.9, 1.629, 139.3],
    rotation: 90,
    svgLayer: "Ground_Floor",
  },
  woods: {
    displayName: "Woods",
    svgFile: "Woods.svg",
    bounds: [
      [646, -914],
      [-761, 442],
    ],
    transform: [0.1855, 112.95, 0.1855, 167.85],
    rotation: 180,
    svgLayer: "Ground_Level",
  },
  shoreline: {
    displayName: "Shoreline",
    svgFile: "Shoreline.svg",
    bounds: [
      [504, -415],
      [-1056, 618],
    ],
    transform: [0.16, 83.2, 0.16, 111.1],
    rotation: 180,
    svgLayer: "Ground_Level",
  },
  rezervbase: {
    displayName: "Reserve",
    svgFile: "Reserve.svg",
    bounds: [
      [289, -293],
      [-303, 244],
    ],
    transform: [0.395, 122, 0.395, 137.65],
    rotation: 180,
    svgLayer: "Ground_Level",
  },
  interchange: {
    displayName: "Interchange",
    svgFile: "Interchange.svg",
    bounds: [
      [598, -442],
      [-433, 426],
    ],
    transform: [0.265, 150.6, 0.265, 134.6],
    rotation: 180,
    svgLayer: "Ground_Level",
  },
  lighthouse: {
    displayName: "Lighthouse",
    svgFile: "Lighthouse.svg",
    bounds: [
      [515, -998],
      [-545, 725],
    ],
    transform: [0.2, 0, 0.2, 0],
    rotation: 180,
    svgLayer: "Ground_Level",
  },
  tarkovstreets: {
    displayName: "Streets of Tarkov",
    svgFile: "StreetsOfTarkov.svg",
    bounds: [
      [323, -295],
      [-280, 532],
    ],
    transform: [0.38, 0, 0.38, 0],
    rotation: 180,
    svgLayer: "Ground_Level",
  },
  laboratory: {
    displayName: "The Lab",
    svgFile: "Labs.svg",
    bounds: [
      [-80, -477],
      [-287, -193],
    ],
    transform: [0.575, 281.2, 0.575, 193.7],
    rotation: 270,
    svgLayer: null,
  },
  sandbox: {
    displayName: "Ground Zero",
    svgFile: "GroundZero.svg",
    bounds: [
      [249, -124],
      [-99, 364],
    ],
    transform: [0.524, 167.3, 0.524, 65.1],
    rotation: 180,
    svgLayer: "Ground_Level",
  },
  sandbox_high: {
    displayName: "Ground Zero (High)",
    svgFile: "GroundZero.svg",
    bounds: [
      [249, -124],
      [-99, 364],
    ],
    transform: [0.524, 167.3, 0.524, 65.1],
    rotation: 180,
    svgLayer: "Ground_Level",
  },
} as const satisfies Record<string, TarkovMapInfo>;

export type TarkovMapCode = keyof typeof TARKOV_MAPS;
export type TarkovMapName = (typeof TARKOV_MAPS)[TarkovMapCode]["displayName"];

export function isKnownMapCode(code: string): code is TarkovMapCode {
  return Object.prototype.hasOwnProperty.call(TARKOV_MAPS, code);
}

export function mapInfo(code: TarkovMapCode): TarkovMapInfo {
  return TARKOV_MAPS[code];
}

export function mapDisplayName(code: string): TarkovMapName | "Unknown" {
  return isKnownMapCode(code) ? TARKOV_MAPS[code].displayName : "Unknown";
}

export function mapSvgPath(code: TarkovMapCode, basePath = "/maps"): string {
  return `${basePath}/${TARKOV_MAPS[code].svgFile}`;
}

export const FACTION_COLORS = {
  pmc: "#22c55e",
  scav: "#eab308",
  shared: "#3b82f6",
} as const satisfies Record<string, string>;

export type FactionKey = keyof typeof FACTION_COLORS;
