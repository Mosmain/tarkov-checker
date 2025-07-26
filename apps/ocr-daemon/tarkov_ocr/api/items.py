from tarkov_ocr.api.schema import QUERY_ITEM_NAMES
from tarkov_ocr.api.tarkov import graphql_request, extract_items_safe

def fetch_item_names() -> list[str]:
    response = graphql_request(QUERY_ITEM_NAMES)
    items = extract_items_safe(response, context="Загрузка списка предметов")
    return [item["name"] for item in items]
