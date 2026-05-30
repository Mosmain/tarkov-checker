import { describe, it, expect } from 'vitest';
import { parseLogLine } from '@shared/parse-log';

describe('parseLogLine', () => {
  describe('scene preset line (earliest signal — primary trigger)', () => {
    it('extracts the rcid mapId from a pre-1.0.5.0 Customs load', () => {
      const line =
        '2026-05-24 21:06:56.632|1.0.4.9.45133|Info|application|scene preset path:maps/customs_preset.bundle rcid:bigmap.scenespreset.asset';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'bigmap' });
    });

    it('extracts the rcid mapId from a Ground Zero (high tier) load', () => {
      const line =
        '2026-05-24 23:59:49.615|1.0.4.9.45133|Info|application|scene preset path:maps/sandbox_high_preset.bundle rcid:sandbox_high.scenespreset.asset';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'sandbox_high' });
    });

    it('captures the renamed Factory bundle key shipped in 1.0.5.0', () => {
      const line =
        '2026-05-30 00:37:17.561|1.0.5.0.45272|Info|application|scene preset path:maps/factory_day_preset.bundle rcid:factory_day.scenespreset.asset';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'factory_day' });
    });

    it('captures the renamed Streets bundle key shipped in 1.0.5.0', () => {
      const line =
        '2026-05-30 00:46:20.393|1.0.5.0.45272|Info|application|scene preset path:maps/city_preset.bundle rcid:city.scenespreset.asset';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'city' });
    });

    it('lowercases the PascalCase Reserve rcid from 1.0.5.0', () => {
      // Reserve is the only sampled map with a non-lowercase rcid — BSG ship
      // it as `Rezerv_Base` (with underscore). The normaliser collapses
      // case-only divergence so downstream alias lookups stay deterministic.
      const line =
        '2026-05-30 01:01:23.704|1.0.5.0.45272|Info|application|scene preset path:maps/rezerv_base_preset.bundle rcid:Rezerv_Base.scenespreset.asset';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'rezerv_base' });
    });

    it('captures the unchanged Lighthouse rcid in 1.0.5.0', () => {
      const line =
        '2026-05-30 01:11:02.660|1.0.5.0.45272|Info|application|scene preset path:maps/lighthouse_preset.bundle rcid:lighthouse.scenespreset.asset';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'lighthouse' });
    });

    it('captures the Interchange PascalCase variant — Shopping_Mall.ScenesPreset.asset', () => {
      // BSG is inconsistent with this one: every other map uses
      // `scenespreset.asset` (lowercase, one word) but Interchange ships as
      // `ScenesPreset.asset` (PascalCase + the plural "Scenes"). The /i flag
      // on SCENE_PRESET_RE absorbs that divergence; the lowercased capture
      // then resolves via the `shopping_mall` → `interchange` alias.
      const line =
        '2026-05-30 02:57:23.234|1.0.5.0.45272|Info|application|scene preset path:maps/shopping_mall.bundle rcid:Shopping_Mall.ScenesPreset.asset';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'shopping_mall' });
    });
  });

  describe('[Transit] Locations: line (1.0.5.0 fallback, canonical id)', () => {
    it('captures a non-transit Factory raid (empty destination)', () => {
      const line =
        '2026-05-30 00:37:32.803|1.0.5.0.45272|Info|application|[Transit] Flag:None, RaidId:6a1a0706068ed468b5025472, Count:0, Locations:factory4_day -> ';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'factory4_day' });
    });

    it('lowercases the PascalCase Streets Locations id', () => {
      const line =
        '2026-05-30 00:47:26.960|1.0.5.0.45272|Info|application|[Transit] Flag:None, RaidId:6a1a0956f18e63144509b658, Count:0, Locations:TarkovStreets -> ';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'tarkovstreets' });
    });

    it('lowercases the PascalCase Reserve Locations id', () => {
      const line =
        '2026-05-30 01:02:01.363|1.0.5.0.45272|Info|application|[Transit] Flag:None, RaidId:6a1a0cc19a8239cecd052cd8, Count:0, Locations:RezervBase -> ';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'rezervbase' });
    });

    it('lowercases the Sandbox_high Locations id (single underscore, capital S)', () => {
      const line =
        '2026-05-25 00:00:19.100|1.0.4.9.45133|Info|application|[Transit] Flag:None, RaidId:6a1366d3875fd4b56d072ec8, Count:0, Locations:Sandbox_high -> ';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'sandbox_high' });
    });

    it('captures Interchange via the Transit fallback (canonical id direct)', () => {
      const line =
        '2026-05-30 02:58:22.690|1.0.5.0.45272|Info|application|[Transit] Flag:None, RaidId:6a1a28064edfc272cf0d55d8, Count:0, Locations:Interchange -> ';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'interchange' });
    });
  });

  describe('TRACE-NetworkGameCreate Location: line (pre-1.0.5.0 fallback)', () => {
    it('extracts the Location id from the legacy profileStatus dump', () => {
      // BSG removed this line in 1.0.5.0 but the pattern stays so historical
      // (pre-update) session folders still parse correctly.
      const line =
        "2026-05-24 21:07:29.056|1.0.4.9.45133|Debug|application|TRACE-NetworkGameCreate profileStatus: 'Profileid: 66a5fb25243385abc70a191a, Status: Busy, RaidMode: Online, Ip: 87.242.110.44, Port: 17000, Location: bigmap, Sid: RU-MSK03G039_6a133dea142495fdaf1eecaa_24.05.26_21-05-30, GameMode: deathmatch, shortId: FMSX90'";
      expect(parseLogLine(line)).toEqual({ rawMapId: 'bigmap' });
    });
  });

  describe('negative cases (real lines that look close but must not match)', () => {
    it('ignores numeric TRACE-NetworkGameCreate sentinels', () => {
      expect(
        parseLogLine(
          '2026-05-24 21:07:28.896|1.0.4.9.45133|Debug|application|TRACE-NetworkGameCreate 0',
        ),
      ).toBeNull();
    });

    it('ignores LocationLoaded timing lines (no map id)', () => {
      expect(
        parseLogLine(
          '2026-05-24 21:07:28.861|1.0.4.9.45133|Info|application|LocationLoaded:18.31 real:33.01 diff:14.69',
        ),
      ).toBeNull();
    });

    it('ignores MatchingCompleted lines', () => {
      expect(
        parseLogLine(
          '2026-05-24 21:07:12.029|1.0.4.9.45133|Info|application|MatchingCompleted:11.23 real:16.17 diff:4.94',
        ),
      ).toBeNull();
    });

    it('ignores GameStarted lines', () => {
      expect(
        parseLogLine(
          '2026-05-24 21:08:48.695|1.0.4.9.45133|Info|application|GameStarted:91.37(10.7) real:112.84(12.02) diff:21.46',
        ),
      ).toBeNull();
    });

    it('ignores BEClient exit lines (raid-end signal, no map id payload)', () => {
      expect(
        parseLogLine(
          '2026-05-30 00:41:25.672|1.0.5.0.45272|Info|application|BEClient exit',
        ),
      ).toBeNull();
      expect(
        parseLogLine(
          '2026-05-30 00:41:25.773|1.0.5.0.45272|Info|application|BEClient exit successfully',
        ),
      ).toBeNull();
    });

    it('ignores "Local game matching cancelled." lines', () => {
      expect(
        parseLogLine(
          '2026-05-30 00:44:31.621|1.0.5.0.45272|Info|application|Local game matching cancelled.',
        ),
      ).toBeNull();
    });

    it('ignores config dump lines that mention map names as JSON keys', () => {
      expect(parseLogLine('  "SdTarkovStreets": true,')).toBeNull();
      expect(parseLogLine('  "MusicOnRaidEnd": true,')).toBeNull();
    });

    it('ignores garbage and empty input', () => {
      expect(parseLogLine('')).toBeNull();
      expect(parseLogLine('totally unrelated log line')).toBeNull();
    });
  });

  describe('source priority', () => {
    it('prefers scene preset rcid over Transit when both are on the same line (defensive)', () => {
      // Tarkov never emits both in one line, but if it ever did, scene preset
      // should win because it's the earliest signal in the temporal sequence.
      const line =
        'scene preset path:maps/customs_preset.bundle rcid:bigmap.scenespreset.asset [Transit] Flag:None, Locations:woods -> ';
      expect(parseLogLine(line)).toEqual({ rawMapId: 'bigmap' });
    });
  });
});
