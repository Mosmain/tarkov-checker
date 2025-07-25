# Храним строки GraphQL-запросов отдельно
QUERY_ITEM_NAMES = """
{
  items(lang: ru, gameMode: pve) {
    name
  }
}
"""

QUERY_ITEM_DETAILS_BY_NAME = """
query ($name: String!) {
  items(name: $name, lang: ru, gameMode: pve) {
    name
    description
    types
    avg24hPrice
    basePrice
    changeLast48hPercent
    iconLink
    gridImageLink
    baseImageLink
    inspectImageLink
    image512pxLink
    image8xLink
    sellFor {
      price
      vendor {
        name
        normalizedName
      }
    }
  }
}
"""
