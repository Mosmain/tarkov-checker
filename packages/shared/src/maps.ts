export const TARKOV_MAPS = {
  bigmap: "Customs",
  factory4_day: "Factory (Day)",
  factory4_night: "Factory (Night)",
  woods: "Woods",
  shoreline: "Shoreline",
  rezervbase: "Reserve",
  interchange: "Interchange",
  lighthouse: "Lighthouse",
  tarkovstreets: "Streets of Tarkov",
  laboratory: "The Lab",
  sandbox: "Ground Zero",
  sandbox_high: "Ground Zero (High)",
} as const satisfies Record<string, string>;

export type TarkovMapCode = keyof typeof TARKOV_MAPS;
export type TarkovMapName = (typeof TARKOV_MAPS)[TarkovMapCode];

export function isKnownMapCode(code: string): code is TarkovMapCode {
  return Object.prototype.hasOwnProperty.call(TARKOV_MAPS, code);
}

export function mapDisplayName(code: string): TarkovMapName | "Unknown" {
  return isKnownMapCode(code) ? TARKOV_MAPS[code] : "Unknown";
}
