from tarkov_ocr.api.schema import QUERY_ITEM_DETAILS_BY_NAME
from tarkov_ocr.api.tarkov import graphql_request_safe, extract_items_safe
from tarkov_ocr.api.types import LangCode, GameMode
from tarkov_ocr.api.constants import DEFAULT_LANG, DEFAULT_GAME_MODE

def fetch_item_details(name: str, lang: LangCode = DEFAULT_LANG, game_mode: GameMode = DEFAULT_GAME_MODE) -> dict | None:
    response = graphql_request_safe(
        QUERY_ITEM_DETAILS_BY_NAME,
        {"name": name, "lang": lang, "gameMode": game_mode}
    )
    items = extract_items_safe(response, context=f"Поиск предмета: {name}")

    if not items:
        print(f"⚠️ Предмет не найден в API: {name}")
        return None

    return items[0]
