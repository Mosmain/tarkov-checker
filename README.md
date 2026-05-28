# tarkov-checker

_English below · [Русский ниже](#tarkov-checker-русская-версия)_

Live in-raid map for Escape from Tarkov. Watches Tarkov's screenshot
folder, parses your position from F12-overlay filenames, and renders
it on a Leaflet map with the community SVG layers.

Two ways to use it:

1. **Desktop overlay** (primary): a single `.exe` that opens a
   frameless transparent always-on-top window over the game. Includes
   click-through lock, global hotkeys, and a system-tray fallback.
2. **LAN / phone PWA** (optional, for power users): a Node server on
   the PC plus the same map as a PWA on your phone over Wi-Fi. See
   [Hacking on this](#hacking-on-this) below.

## Quick start

1. Download `tarkov-checker-desktop.exe` from the
   [latest Release](../../releases).
2. Drop it anywhere on disk — Desktop, USB stick, wherever. Fully
   portable, no installer, no admin rights, no background service.
3. Double-click. First launch auto-detects your Tarkov install via
   the Windows registry. If that didn't work, set the paths manually
   in Settings → Tarkov paths.
4. In Tarkov, hit **F12** during a raid. The screenshot drops into
   your Tarkov screenshots folder; the overlay reads its filename
   and moves your marker on the map.

State (path overrides, tarkov.dev extract cache) lives in
`%APPDATA%/tarkov-checker/`. Close the window to exit — nothing
lingers in Task Manager.

## Tarkov paths

Two paths matter:

- **Game folder** — where Tarkov is installed (e.g. `D:\EFT`). Logs
  are read from `<gameFolder>\Logs`.
- **Screenshots folder** — where F12 screenshots end up. Default is
  `<Documents>\Escape from Tarkov\Screenshots`, but Documents may be
  redirected to OneDrive on Windows 11.

The overlay resolves them in this order (highest priority first):

1. Environment variables: `TARKOV_GAME_DIR`, `TARKOV_SCREENSHOT_DIR`,
   `TARKOV_LOG_DIR`. Optional; useful for non-standard installs.
2. Manual override saved through Settings → Tarkov paths, persisted
   to `%APPDATA%/tarkov-checker/config.json`.
3. Auto-detect from the Windows registry — the BSG launcher writes
   the install location there, and Windows tracks the real Documents
   path even when redirected to OneDrive.

If auto-detect fails (you installed manually, or BSG didn't write
the key), fill `Game folder` in Settings and click Save. Watchers
re-apply immediately, no restart needed.

## Hacking on this

Engineering notes, dev workflow, build/CI procedures, and Windows
toolchain gotchas live in [CLAUDE.md](CLAUDE.md).

TL;DR for a dev clone:

```pwsh
git clone --recurse-submodules https://github.com/Mosmain/tarkov-checker.git
cd tarkov-checker
pnpm install
pnpm --filter @tarkov-checker/client dev      # in one terminal
pnpm --filter @tarkov-checker/desktop tauri:dev   # in another
```

## Credits

SVG maps from [the-hideout/tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps)
(CC BY-NC-SA 4.0) — vendored as a git submodule under
`apps/client/public/maps/`. Map calibration values (the in-game →
SVG-pixel affine transforms) are ported from
[the-hideout/tarkov-dev](https://github.com/the-hideout/tarkov-dev)
(MIT). See [CREDITS.md](CREDITS.md) for full attribution.

## License

See [LICENSE](./LICENSE).

---

# tarkov-checker (русская версия)

Лайв-карта для рейдов в Escape from Tarkov. Следит за папкой
скриншотов Tarkov, парсит твою позицию из имён F12-скриншотов и
рисует её на Leaflet-карте с SVG-слоями от сообщества.

Два способа использовать:

1. **Десктоп-оверлей** (основной): один `.exe`, открывает безрамочное
   прозрачное окно поверх игры. С блокировкой click-through (когда
   мышь проходит сквозь окно в Tarkov), глобальными хоткеями и
   системным треем как запасной выход.
2. **LAN / PWA на телефоне** (опционально, для энтузиастов):
   Node-сервер на ПК плюс та же карта как PWA на телефоне по Wi-Fi.
   Смотри секцию [Разработка](#разработка) ниже.

## Быстрый старт

1. Скачай `tarkov-checker-desktop.exe` из [последнего релиза](../../releases).
2. Положи куда удобно — на Рабочий стол, флешку, в любую папку.
   Полностью portable, без установщика, без админских прав, без
   фоновых сервисов.
3. Запусти двойным кликом. При первом запуске путь до Tarkov
   ищется в реестре Windows автоматически. Если не нашёлся —
   укажи руками в Settings → Tarkov paths.
4. В Tarkov жми **F12** в рейде. Скриншот падает в папку
   скриншотов Tarkov, оверлей читает имя файла и двигает маркер
   игрока на карте.

Состояние (переопределения путей, кэш экстрактов с tarkov.dev)
живёт в `%APPDATA%/tarkov-checker/`. Закрыл окно — приложение
полностью вышло, ничего не висит в Диспетчере задач.

## Пути Tarkov

Два пути имеют значение:

- **Папка игры** — где установлен Tarkov (например, `D:\EFT`).
  Логи читаются из `<папка игры>\Logs`.
- **Папка скриншотов** — куда падают F12-скриншоты. По умолчанию
  `<Документы>\Escape from Tarkov\Screenshots`, но на Windows 11
  Документы часто перенаправлены в OneDrive.

Оверлей резолвит их по такому порядку (от высшего приоритета к
низшему):

1. Переменные окружения: `TARKOV_GAME_DIR`, `TARKOV_SCREENSHOT_DIR`,
   `TARKOV_LOG_DIR`. Опционально; полезно для нестандартных
   установок.
2. Ручное переопределение через Settings → Tarkov paths,
   сохраняется в `%APPDATA%/tarkov-checker/config.json`.
3. Автодетект из реестра Windows — лаунчер BSG пишет путь
   установки туда, а Windows знает реальное расположение Документов
   даже когда они перенаправлены в OneDrive.

Если автодетект не сработал (установил вручную или лаунчер не
прописал ключ) — заполни «Game folder» в Settings и нажми Save.
Слежение перезапустится сразу, без рестарта приложения.

## Разработка

Инженерные заметки, dev workflow, процедуры сборки/CI и подводные
камни Windows-тулчейна лежат в [CLAUDE.md](CLAUDE.md).

TL;DR для dev-клона:

```pwsh
git clone --recurse-submodules https://github.com/Mosmain/tarkov-checker.git
cd tarkov-checker
pnpm install
pnpm --filter @tarkov-checker/client dev          # в одном терминале
pnpm --filter @tarkov-checker/desktop tauri:dev   # в другом
```

## Благодарности

SVG-карты из [the-hideout/tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps)
(CC BY-NC-SA 4.0) — подключены как git-сабмодуль в
`apps/client/public/maps/`. Калибровка карт (аффинные трансформации
in-game координат в SVG-пиксели) портирована из
[the-hideout/tarkov-dev](https://github.com/the-hideout/tarkov-dev)
(MIT). Полная справка по атрибуции — в [CREDITS.md](CREDITS.md).

## Лицензия

См. [LICENSE](./LICENSE).
