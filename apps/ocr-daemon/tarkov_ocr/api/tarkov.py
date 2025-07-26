import requests
import asyncio
from typing import Any, Optional, TypedDict

from tarkov_ocr.api.constants import TARKOV_API_URL
from tarkov_ocr.ws.dispatcher import broadcast_error
from tarkov_ocr.ws.state import loop


class GraphQLResponse(TypedDict, total=False):
    data: dict
    errors: list[Any]


def graphql_request(query: str, variables: Optional[dict] = None) -> GraphQLResponse:
    try:
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        response = requests.post(TARKOV_API_URL, json=payload)
        response.raise_for_status()

        result = response.json()

        if "errors" in result:
            return {"errors": result["errors"]}

        return result
    except requests.RequestException as e:
        print(f"❌ Ошибка при запросе к Tarkov API: {e}")
        return {
            "errors": [{
                "message": str(e),
                "extensions": {"code": "REQUEST_EXCEPTION"}
            }]
        }


def _extract_items(response_data: GraphQLResponse) -> list[dict]:
    data = response_data.get("data")
    if not data or not isinstance(data, dict):
        print("⚠️ Ответ GraphQL не содержит корректного поля 'data'")
        return []

    items = data.get("items")
    if not items or not isinstance(items, list):
        print("⚠️ Поле 'items' отсутствует или не является списком")
        return []

    return items


def extract_items_safe(response_data: GraphQLResponse, context: str = "Tarkov API") -> list[dict]:
    if "errors" in response_data:
        first_error = response_data["errors"][0]
        message = first_error.get("message", "Неизвестная ошибка от API")
        code = first_error.get("extensions", {}).get("code", "UNKNOWN")

        asyncio.run_coroutine_threadsafe(
            broadcast_error(f"{context}: {message}", code),
            loop
        )
        return []

    return _extract_items(response_data)
