import json
import requests
from tarkov_ocr import config

TARKOV_API = "https://api.tarkov.dev/graphql"

QUERY = """
{
  items {
    name
  }
}
"""

def load_items():
    if config.ITEMS_CACHE_PATH.exists():
        with open(config.ITEMS_CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    response = requests.post(TARKOV_API, json={"query": QUERY})
    data = response.json()
    items = data["data"]["items"]

    config.ITEMS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(config.ITEMS_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    return items
