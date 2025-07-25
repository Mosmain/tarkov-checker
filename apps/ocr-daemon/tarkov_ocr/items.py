import json
import requests
import time
from tarkov_ocr import config

TARKOV_API = "https://api.tarkov.dev/graphql"

QUERY = """
{
  items(lang: ru, gameMode: pve) {
    name
  }
}
"""

def is_cache_fresh(path):
    return path.exists() and (time.time() - path.stat().st_mtime < config.CACHE_TTL)

def load_items():
    if is_cache_fresh(config.ITEMS_CACHE_PATH):
        with open(config.ITEMS_CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    response = requests.post(TARKOV_API, json={"query": QUERY})
    response.raise_for_status()

    data = response.json()
    items_data = data["data"]["items"]
    item_names = [item["name"] for item in items_data]

    config.ITEMS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(config.ITEMS_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(item_names, f, ensure_ascii=False, separators=(",", ":"))

    return item_names
