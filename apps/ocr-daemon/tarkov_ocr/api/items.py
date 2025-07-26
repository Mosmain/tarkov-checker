from tarkov_ocr.api.schema import QUERY_ITEM_NAMES
from tarkov_ocr.api.tarkov import graphql_request_safe, extract_items_safe
from tarkov_ocr.api.types import LangCode, GameMode
from tarkov_ocr.api.constants import DEFAULT_LANG, DEFAULT_GAME_MODE

def fetch_item_names(lang: LangCode = DEFAULT_LANG, game_mode: GameMode = DEFAULT_GAME_MODE) -> list[str]:
    response = graphql_request_safe(
        QUERY_ITEM_NAMES,
        {"lang": lang, "gameMode": game_mode}
    )
    items = extract_items_safe(response, context="Загрузка списка предметов")
    return [item["name"] for item in items]
