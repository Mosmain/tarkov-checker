import json
import requests
import time
from pathlib import Path
from tarkov_ocr import config

TARKOV_API = "https://api.tarkov.dev/graphql"

QUERY = """
{
  items(lang: ru, gameMode: pve) {
    name
  }
}
"""

def is_cache_fresh(path: Path) -> bool:
    return path.exists() and (time.time() - path.stat().st_mtime < config.CACHE_TTL)

def load_items_from_cache(path: Path) -> list[str] | None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return None

def download_items(path: Path) -> list[str]:
    try:
        response = requests.post(TARKOV_API, json={"query": QUERY})
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"❌ Ошибка при запросе к Tarkov API: {e}")
        raise

    data = response.json()
    items_data = data["data"]["items"]
    item_names = [item["name"] for item in items_data]

    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(item_names, f, ensure_ascii=False, separators=(",", ":"))

    return item_names

def get_items() -> list[str]:
    """
    Возвращает актуальный список предметов:
    - из кэша, если он свежий и читаемый;
    - из API, если кэш устарел или повреждён.
    """
    cache_path = config.ITEMS_CACHE_PATH

    if is_cache_fresh(cache_path):
        items = load_items_from_cache(cache_path)
        if items:
            print("🗂️ Загружаем предметы из кэша")
            return items
        else:
            print("⚠️ Кэш найден, но повреждён. Загружаем заново...")

    print("🌐 Кэш отсутствует или устарел. Запрос к Tarkov API...")
    item_names = download_items(cache_path)
    print(f"✅ Загружено {len(item_names)} предметов из API")
    return item_names
