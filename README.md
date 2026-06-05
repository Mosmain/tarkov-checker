# tarkov-checker

A live in-raid map companion for Escape from Tarkov. The overlay watches your Tarkov screenshots and logs in real time, tracking your position and marking extracts on an interactive Leaflet map with community SVG layers.

## Features

| Feature                                           | Desktop Overlay | LAN / Phone |
| ------------------------------------------------- | :-------------: | :---------: |
| Live player position tracking                     |        ✓        |      ✓      |
| Auto-switch maps on raid start                    |        ✓        |      ✓      |
| Extract locations with faction filter             |        ✓        |      ✓      |
| Airdrop triangulation & landing prediction        |        ✓        |      —      |
| Multi-floor map switcher (Factory, Reserve, etc.) |        ✓        |      ✓      |
| Click-through lock & global hotkeys               |        ✓        |      —      |
| Window opacity & always-on-top control            |        ✓        |      —      |
| Bilingual UI (English / Russian)                  |        ✓        |      ✓      |

## Deployment Modes

**Desktop overlay** (primary): a single 6 MB portable `.exe` that opens as a frameless transparent always-on-top window over your game. No installer, no admin rights, no background service. All game monitoring happens in-process — your position is extracted from Tarkov's PrintScreen overlay screenshots, and raid transitions are detected by parsing the active session logs.

**LAN / phone PWA** (optional): the overlay's in-process Rust helper (axum, on `0.0.0.0:47474`) serves the same map interface to any browser on your local network — perfect for a second monitor or a phone on the same Wi-Fi. The release build serves the embedded SPA directly; in dev, Vite on :5173 proxies to it.

## Quick Start

### End Users

1. Download `tarkov-checker-desktop.exe` from the [latest Release](../../releases/latest).
2. Drop it anywhere — Desktop, USB stick, Downloads folder. It's completely portable.
3. Double-click to launch. On first run, the overlay auto-detects your Tarkov installation via the Windows registry. If that fails, manually set the paths in **Settings → Tarkov paths**.
4. In Tarkov, press **PrintScreen** during a raid. The screenshot drops into your Tarkov screenshots folder, and the overlay reads its filename to update your position on the map.

**Data storage**: settings and cache live in `%APPDATA%/tarkov-checker/`. By default, closing the window exits the app. Optionally, enable "Minimize to tray" in Settings to hide the window to the system tray instead of closing (the tray icon's "Show" restores it, "Quit" exits).

### Developers

Clone with submodules, install dependencies, then choose your dev mode:

```bash
git clone --recurse-submodules https://github.com/Mosmain/tarkov-checker.git
cd tarkov-checker
pnpm install
```

**Dev** (one command — Tauri spawns Vite on :5173 and the helper on :47474):

```bash
pnpm --filter @tarkov-checker/desktop tauri:dev
```

A browser on the same PC or a phone on the same Wi-Fi can hit
`http://<your-pc-ip>:5173/` — Vite proxies `/api/*` and `/events` to
the helper. The release build serves the SPA from the .exe at
`http://<your-pc-ip>:47474/` instead (no Vite there).

## Tarkov Path Resolution

The overlay needs two directories:

- **Game folder** (e.g., `D:\EFT`) — logs are read from `<gameFolder>\Logs`
- **Screenshots folder** — where PrintScreen images are saved, typically `<Documents>\Escape from Tarkov\Screenshots`

Resolution priority (highest to lowest):

1. **Environment variables** — `TARKOV_GAME_DIR`, `TARKOV_SCREENSHOT_DIR` (optional; useful for non-standard setups)
2. **Manual override** — Settings → Tarkov paths, persisted to `%APPDATA%/tarkov-checker/config.json`
3. **Windows registry auto-detect** — the BSG launcher writes the install path to the registry, and Windows tracks the real Documents location even when redirected to OneDrive

If auto-detect fails, fill in **Game folder** in Settings and click **Save**. Watchers restart immediately — no app restart needed.

## Feature Details

**Live player position**: The overlay monitors your Tarkov screenshots folder. Each PrintScreen you take in-raid embeds your world position (x, z coordinates) and viewing direction (quaternion) in the filename. The overlay parses this, places a directional arrow on the correct map at the correct rotation, and optionally auto-recenters to follow you (toggle on/off in the Player section of Settings).

**Auto-map switching**: The overlay tails your active Tarkov session log and detects scene-preset and Transit-location lines. When you load into a raid, it automatically flips the displayed map to match. This includes aliases for maps renamed in patch 1.0.5.0 (Factory, Reserve, Interchange). Toggle in Settings; enabled by default.

**Airdrop triangulation**: Press a configurable hotkey (default **Ctrl+Alt+D**) to arm the tracker. Take a PrintScreen while looking at a falling airdrop to record its bearing. Sidestep ~5 meters and take another PrintScreen to capture a second angle. The overlay triangulates the intersection and marks the landing spot with an uncertainty circle. Press the hotkey again to clear the marker with a 3-second countdown confirmation.

**Extracts overlay**: displays every known extract on every map with faction filtering (PMC / Scav / Shared) and label customization (always visible or on hover). Uses the same faction-color scheme across all UI elements.

**Multi-floor maps**: Most maps have floor switchers (Customs, Factory, Shoreline, Reserve, Interchange, Streets, The Lab, Ground Zero). Woods and Lighthouse are single-level. Switch floors via the stepper in the left-side layer rail, or hold **Alt** and scroll your mouse wheel over the map. Dedicated hotkeys (Floor-up/Floor-down) also work.

**Window controls** (desktop overlay only):

- **Drag** the transport-status pill in the top-right to move the overlay
- **Layer rail** (left edge of map) — quick toggles to show/hide player position, extracts, airdrop markers. Each layer has a gear icon to open its settings.
- **Settings button** (gear in top-right cluster) — app/system preferences: overlay opacity, hotkeys, language, Tarkov paths, pairing. Layer settings are accessed via the rail.
- **Click-through lock** (Ctrl+Alt+L) — toggle whether mouse clicks pass through to the game underneath. When locked, the interactive controls hide but glanceable readouts remain: Tarkov time, map name, connection status, floor indicator (top-left), and the unlock hotkey hint (bottom-right).
- **Always-on-top** — keep the overlay above Tarkov even when the game window is focused
- **Opacity slider** — adjust overall window transparency (30–100%). Map area and other UI elements fade uniformly.
- **Map opacity slider** — independently adjust map transparency while keeping UI controls solid (0–100%)
- **Zoom** — scale the entire UI
- **Close** button with confirmation (unless "Minimize to tray" is enabled, then it hides to the tray)

## Supported Maps

Customs, Factory (Day/Night), Woods, Shoreline, Reserve, Interchange, Lighthouse, Streets of Tarkov, The Lab, Ground Zero, and Ground Zero (High).

## How It Works

The project consists of:

- **Tauri 2 desktop wrapper** (`apps/desktop`) — native window management, file watchers, screenshot parser, log tailer, in-process HTTP server (Rust + axum) on `0.0.0.0:47474`, IPC bridge to the web UI
- **Vue 3 + Leaflet map** (`apps/client`) — interactive map rendering, extract markers, player position arrow, UI controls; talks to the helper via Tauri IPC inside the overlay and via HTTP + SSE when opened in a regular browser
- **Shared modules** (`packages/shared`) — map calibration data, position/event schemas, log parser, type definitions

Screenshots and logs are processed locally with no external API calls during gameplay. Extracts data is bundled into the app at build time.

## Architecture Details

See [CLAUDE.md](CLAUDE.md) for in-depth engineering documentation: dev workflow, Tauri overlay configuration, multi-version logs parsing, Windows build quirks, CI/release procedures, and the in-process Rust HTTP server (`/api/config`, `/api/hotkeys`, `/events`).

## Credits

- **SVG maps** from [the-hideout/tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps) (CC BY-NC-SA 4.0), vendored as a git submodule under `apps/client/public/maps/`
- **Map calibration values** (in-game coordinate → SVG-pixel transforms) ported from [the-hideout/tarkov-dev](https://github.com/the-hideout/tarkov-dev) (MIT)

See [CREDITS.md](CREDITS.md) for full attribution.

## License

See [LICENSE](./LICENSE).

---

# tarkov-checker (русская версия)

Спутник-карта для рейдов в Escape from Tarkov. Оверлей следит за скриншотами и логами вашей игры, отслеживая вашу позицию в реальном времени и отмечая выходы на интерактивной Leaflet-карте с SVG-слоями от сообщества.

## Возможности

| Функция                                             | Десктоп-оверлей | LAN / Телефон |
| --------------------------------------------------- | :-------------: | :-----------: |
| Отслеживание позиции игрока в реальном времени      |        ✓        |       ✓       |
| Автосмена карты при начале рейда                    |        ✓        |       ✓       |
| Локации выходов с фильтром по фракциям              |        ✓        |       ✓       |
| Триангуляция и предсказание точки приземления дропа |        ✓        |       —       |
| Переключатель этажей (Factory, Reserve и т.д.)      |        ✓        |       ✓       |
| Блокировка клика и глобальные хоткеи                |        ✓        |       —       |
| Управление прозрачностью и режимом поверх всех окон |        ✓        |       —       |
| Двуязычный интерфейс (English / Русский)            |        ✓        |       ✓       |

## Режимы развертывания

**Десктоп-оверлей** (основной): один портативный `.exe` размером 6 МБ, открывающийся безрамочным прозрачным окном поверх игры. Без установщика, без админских прав, без фоновых сервисов. Все отслеживание игры происходит в одном процессе — ваша позиция извлекается из PrintScreen-скриншотов с оверлеем Tarkov, а переходы между рейдами определяются парсингом логов активной сессии.

**LAN / PWA на телефоне** (опционально): встроенный в оверлей Rust-хелпер (axum, на `0.0.0.0:47474`) отдаёт ту же карту в браузер любого устройства в локальной сети — идеально для второго монитора или телефона в одной Wi-Fi сети. Release-сборка отдаёт встроенный SPA напрямую; в режиме разработки Vite на :5173 проксирует к нему.

## Быстрый старт

### Для игроков

1. Скачай `tarkov-checker-desktop.exe` из [последнего релиза](../../releases/latest).
2. Положи куда угодно — на Рабочий стол, флешку, папку Downloads. Полностью портативное приложение.
3. Запусти двойным кликом. При первом запуске оверлей автоматически обнаружит твою установку Tarkov через реестр Windows. Если не получится, вручную укажи пути в **Settings → Tarkov paths**.
4. В Tarkov нажми **PrintScreen** во время рейда. Скриншот упадёт в папку скриншотов Tarkov, а оверлей прочитает имя файла и обновит твою позицию на карте.

**Хранение данных**: настройки и кэш живут в `%APPDATA%/tarkov-checker/`. По умолчанию закрытие окна завершает приложение. Опционально включи "Minimize to tray" в Settings, чтобы скрыть окно в системный трей вместо закрытия (пункт "Show" в меню трея его восстанавливает, "Quit" завершает приложение).

### Для разработчиков

Клонируй с сабмодулями, установи зависимости, затем выбери режим разработки:

```bash
git clone --recurse-submodules https://github.com/Mosmain/tarkov-checker.git
cd tarkov-checker
pnpm install
```

**Разработка десктоп-оверлея** (одна команда — Tauri поднимает Vite на :5173):

```bash
pnpm --filter @tarkov-checker/desktop tauri:dev
```

Браузер на том же ПК или телефон в той же Wi-Fi могут открывать
`http://<ip-твоего-пк>:5173/` — Vite проксирует `/api/*` и `/events`
в helper. В release-сборке SPA отдаёт сам .exe на
`http://<ip-твоего-пк>:47474/` (Vite там нет).

## Определение путей Tarkov

Оверлею нужны две директории:

- **Папка игры** (например, `D:\EFT`) — логи читаются из `<папка игры>\Logs`
- **Папка скриншотов** — куда сохраняются PrintScreen-скриншоты, обычно `<Документы>\Escape from Tarkov\Screenshots`

Приоритет определения (от высшего к низшему):

1. **Переменные окружения** — `TARKOV_GAME_DIR`, `TARKOV_SCREENSHOT_DIR` (опционально; полезно для нестандартных установок)
2. **Ручное переопределение** — Settings → Tarkov paths, сохраняется в `%APPDATA%/tarkov-checker/config.json`
3. **Автодетект из реестра Windows** — лаунчер BSG пишет путь установки в реестр, и Windows отслеживает реальное расположение Документов даже когда они перенаправлены в OneDrive

Если автодетект не сработал, заполни **Game folder** в Settings и нажми **Save**. Слежение перезапустится сразу — перезапуска приложения не требуется.

## Подробное описание функций

**Отслеживание позиции игрока**: оверлей мониторит папку скриншотов Tarkov. Каждый PrintScreen во время рейда содержит в имени файла твои мировые координаты (x, z) и направление взгляда (кватернион). Оверлей парсит это, ставит стрелку на правильную карту под правильным углом и опционально автоцентрирует вид, чтобы следить за тобой (включается/выключается в разделе Player в Settings).

**Автосмена карт**: оверлей отслеживает активный лог сессии Tarkov и ловит строки scene-preset и Transit-location. Когда ты загружаешься в рейд, отображаемая карта автоматически переключается. Это включает поддержку переименованных в патче 1.0.5.0 карт (Factory, Reserve, Interchange). Включается в Settings; по умолчанию включено.

**Триангуляция дропа**: нажми настраиваемый хоткей (по умолчанию **Ctrl+Alt+D**) для активирования. Сделай PrintScreen, смотря на падающий дроп, чтобы записать его пеленг. Отойди в сторону на ~5 метров и сделай второй PrintScreen для захвата второго угла. Оверлей триангулирует пересечение и отметит точку приземления кругом неопределённости. Нажми хоткей снова для удаления отметки с подтверждением обратного отсчёта в 3 секунды.

**Оверлей выходов**: отображает все известные выходы на каждой карте с фильтром по фракциям (PMC / Scav / Shared) и настройкой видимости подписей (всегда или при наведении). Использует одну цветовую схему фракций по всему интерфейсу.

**Многоэтажные карты**: на большинстве карт есть переключатели этажей (Customs, Factory, Shoreline, Reserve, Interchange, Streets, The Lab, Ground Zero). Woods и Lighthouse одноуровневые. Переключай этажи через степпер на левом rail-е карты, или зажми **Alt** и крутни колёсико мыши над картой. Работают и отдельные хоткеи (Floor-up/Floor-down).

**Управление окном** (только десктоп-оверлей):

- **Перетаскивание**: транспортный статус в правом верхнем углу — перетащи, чтобы переместить оверлей
- **Layer rail** (левый край карты) — быстрые переключатели для показа/скрытия позиции игрока, выходов, маркеров дропа. У каждого слоя есть иконка шестерёнки для его настроек.
- **Кнопка Settings** (шестерёнка в правом верхнем кластере) — параметры приложения и системы: прозрачность оверлея, хоткеи, язык, пути Tarkov, pairing. Настройки слоёв открываются через rail.
- **Блокировка клика** (Ctrl+Alt+L) — переключай, проходят ли клики мышки сквозь окно в игру. Когда заблокирован, интерактивные элементы скрываются, но видная информация остаётся: время Tarkov, имя карты, статус соединения, индикатор этажа (левый верхний угол) и подсказка по хоткею разблокировки (правый нижний угол).
- **Поверх всех окон** — держи оверлей над Tarkov, даже когда окно игры в фокусе
- **Ползунок прозрачности** — изменяй общую видимость окна (30–100%). Карта и весь интерфейс исчезают равномерно.
- **Ползунок прозрачности карты** — независимо изменяй видимость карты, сохраняя UI элементы непрозрачными (0–100%)
- **Масштаб** — меняй размер всего интерфейса
- **Кнопка закрытия** с подтверждением (если не включена опция "Minimize to tray", тогда скрывает в трей)

## Поддерживаемые карты

Customs, Factory (День/Ночь), Woods, Shoreline, Reserve, Interchange, Lighthouse, Streets of Tarkov, The Lab, Ground Zero, и Ground Zero (High).

## Как это работает

Проект состоит из:

- **Tauri 2 десктоп-обёртка** (`apps/desktop`) — управление окнами, слежение за файлами, парсинг скриншотов, отслеживание логов, in-process HTTP-сервер (Rust + axum) на `0.0.0.0:47474`, IPC-мост к веб-интерфейсу
- **Vue 3 + Leaflet карта** (`apps/client`) — интерактивный рендеринг карты, маркеры выходов, стрелка позиции игрока, управление UI; внутри оверлея общается с хелпером через Tauri IPC, в обычном браузере — через HTTP + SSE
- **Общие модули** (`packages/shared`) — калибровка карт, схемы позиций/событий, парсер логов, определения типов

Скриншоты и логи обрабатываются локально без внешних API-вызовов во время игры. Данные выходов встроены в приложение на этапе сборки.

## Архитектурные детали

Смотри [CLAUDE.md](CLAUDE.md) для подробной инженерной документации: dev workflow, конфигурация Tauri-оверлея, парсинг многоверсионных логов, подводные камни Windows-сборки, процедуры CI/релиза, и in-process Rust HTTP-сервер (`/api/config`, `/api/hotkeys`, `/events`).

## Благодарности

- **SVG-карты** из [the-hideout/tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps) (CC BY-NC-SA 4.0), подключены как git-сабмодуль в `apps/client/public/maps/`
- **Калибровка карт** (трансформации in-game координат в SVG-пиксели) портирована из [the-hideout/tarkov-dev](https://github.com/the-hideout/tarkov-dev) (MIT)

Полная справка по атрибуции — в [CREDITS.md](CREDITS.md).

## Лицензия

См. [LICENSE](./LICENSE).
