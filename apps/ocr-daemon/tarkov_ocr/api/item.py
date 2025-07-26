from tarkov_ocr.api.schema import QUERY_ITEM_DETAILS_BY_NAME
from tarkov_ocr.api.tarkov import graphql_request, extract_items_safe

def fetch_item_details(name: str) -> dict | None:
    response = graphql_request(QUERY_ITEM_DETAILS_BY_NAME, {"name": name})
    items = extract_items_safe(response, context=f"Поиск предмета: {name}")

    if not items:
        print(f"⚠️ Предмет не найден в API: {name}")
        return None

    return items[0]
