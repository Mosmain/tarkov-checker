from pathlib import Path

# Путь к папке с логами
LOGS_PATH = Path("D:/EFT/Logs")

# Путь к папке со скриншотами
SCREENSHOTS_PATH = Path.home() / "OneDrive" / "Документы" / "Escape from Tarkov" / "Screenshots"

# Размер области вокруг мыши
CROP_WIDTH = 400
CROP_HEIGHT = 50

# WebSocket
WS_HOST = "0.0.0.0"
WS_PORT = 8765

# Путь к кэшу с предметами
ITEMS_CACHE_PATH = Path("data") / "items.json"
CACHE_TTL = 60 * 60 * 24  # 24 часа

