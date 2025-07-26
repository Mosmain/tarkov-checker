import requests
import asyncio
import json
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type
from typing import Any, Optional, TypedDict

from tarkov_ocr.api.constants import TARKOV_API_URL
from tarkov_ocr.ws.dispatcher import broadcast_error
from tarkov_ocr.ws.state import loop


class GraphQLResponse(TypedDict, total=False):
    data: dict
    errors: list[Any]


def to_camel_case(snake_str: str) -> str:
    parts = snake_str.split('_')
    return parts[0] + ''.join(word.capitalize() for word in parts[1:])


def convert_variables_to_camel(variables: dict) -> dict:
    return {to_camel_case(k): v for k, v in variables.items()}

@retry(
    stop=stop_after_attempt(5),
    wait=wait_fixed(1),
    retry=retry_if_exception_type(requests.RequestException)
)
def _graphql_request(query: str, variables: Optional[dict] = None) -> GraphQLResponse:
    payload = {"query": query}
    if variables:
        payload["variables"] = convert_variables_to_camel(variables)

    response = requests.post(TARKOV_API_URL, json=payload)
    response.raise_for_status()
    result = response.json()

    if "errors" in result:
        return {"errors": result["errors"]}

    return result

def graphql_request_safe(query: str, variables: Optional[dict] = None) -> GraphQLResponse:
    try:
        return _graphql_request(query, variables)
    except requests.RequestException as e:
        print(f"❌ Не удалось выполнить GraphQL-запрос после повторов: {e}")
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
    print("📭 Ответ от GraphQL:", json.dumps(response_data, ensure_ascii=False, indent=2))
    if "errors" in response_data:
        first_error = response_data["errors"][0]
        message = first_error.get("message", "Неизвестная ошибка от API")
        code = first_error.get("extensions", {}).get("code", "UNKNOWN")

        asyncio.run_coroutine_threadsafe(
            broadcast_error(f"{context}: {message}"),
            loop
        )
        return []

    return _extract_items(response_data)
