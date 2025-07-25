from tarkov_ocr.api.schema import QUERY_ITEM_NAMES
from tarkov_ocr.api.tarkov import graphql_request, extract_items

def fetch_item_names() -> list[str]:
    data = graphql_request(QUERY_ITEM_NAMES)
    return [item["name"] for item in extract_items(data)]
