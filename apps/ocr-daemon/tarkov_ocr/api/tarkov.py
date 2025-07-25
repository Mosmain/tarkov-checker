import requests
from tarkov_ocr.api.constants import TARKOV_API_URL

def graphql_request(query: str, variables: dict | None = None) -> dict:
    try:
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        response = requests.post(TARKOV_API_URL, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"❌ Ошибка при запросе к Tarkov API: {e}")
        raise

def extract_items(response_data: dict) -> list[dict]:
    return response_data.get("data", {}).get("items", [])
