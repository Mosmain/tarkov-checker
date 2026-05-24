interface TarkovMapInfo {
  readonly displayName: string;
  readonly svgFile: string;
}

export const TARKOV_MAPS = {
  bigmap: { displayName: "Customs", svgFile: "Customs.svg" },
  factory4_day: { displayName: "Factory (Day)", svgFile: "Factory.svg" },
  factory4_night: { displayName: "Factory (Night)", svgFile: "Factory.svg" },
  woods: { displayName: "Woods", svgFile: "Woods.svg" },
  shoreline: { displayName: "Shoreline", svgFile: "Shoreline.svg" },
  rezervbase: { displayName: "Reserve", svgFile: "Reserve.svg" },
  interchange: { displayName: "Interchange", svgFile: "Interchange.svg" },
  lighthouse: { displayName: "Lighthouse", svgFile: "Lighthouse.svg" },
  tarkovstreets: { displayName: "Streets of Tarkov", svgFile: "StreetsOfTarkov.svg" },
  laboratory: { displayName: "The Lab", svgFile: "Labs.svg" },
  sandbox: { displayName: "Ground Zero", svgFile: "GroundZero.svg" },
  sandbox_high: { displayName: "Ground Zero (High)", svgFile: "GroundZero.svg" },
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
