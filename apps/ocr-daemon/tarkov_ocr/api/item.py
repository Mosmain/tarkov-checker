from tarkov_ocr.api.schema import QUERY_ITEM_DETAILS_BY_NAME
from tarkov_ocr.api.tarkov import graphql_request, extract_items

def fetch_item_details(name: str) -> dict | None:
    data = graphql_request(QUERY_ITEM_DETAILS_BY_NAME, {"name": name})
    items = extract_items(data)

    if not items:
        print(f"⚠️ Предмет не найден в API: {name}")
        return None

    return items[0]
