import json
import time
from pathlib import Path
from tarkov_ocr.core import config
from tarkov_ocr.api.items import fetch_item_names

def is_cache_fresh(path: Path) -> bool:
    return path.exists() and (time.time() - path.stat().st_mtime < config.CACHE_TTL)

def load_items_from_cache(path: Path) -> list[str] | None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return None

def save_items_to_cache(path: Path, items: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, separators=(",", ":"))

def get_items() -> list[str]:
    cache_path = config.ITEMS_CACHE_PATH

    if is_cache_fresh(cache_path):
        items = load_items_from_cache(cache_path)
        if items:
            print("🗂️ Загружаем предметы из кэша")
            return items
        else:
            print("⚠️ Кэш найден, но повреждён. Загружаем заново...")

    print("🌐 Кэш отсутствует или устарел. Запрос к Tarkov API...")
    item_names = fetch_item_names()
    save_items_to_cache(cache_path, item_names)
    print(f"✅ Загружено {len(item_names)} предметов из API")
    return item_names
