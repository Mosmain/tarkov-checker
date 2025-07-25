import requests
from typing import Any
from tarkov_ocr.api.schema import QUERY_ITEM_NAMES

TARKOV_API_URL = "https://api.tarkov.dev/graphql"

def fetch_item_names() -> list[str]:
    try:
        response = requests.post(TARKOV_API_URL, json={"query": QUERY_ITEM_NAMES})
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"❌ Ошибка при запросе к Tarkov API: {e}")
        raise

    data: dict[str, Any] = response.json()
    items_data = data["data"]["items"]
    return [item["name"] for item in items_data]
