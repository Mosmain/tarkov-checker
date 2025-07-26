# Храним строки GraphQL-запросов с переменными
QUERY_ITEM_NAMES = """
query ($lang: LanguageCode, $gameMode: GameMode) {
  items(lang: $lang, gameMode: $gameMode) {
    name
  }
}
"""

QUERY_ITEM_DETAILS_BY_NAME = """
query ($name: String!, $lang: LanguageCode, $gameMode: GameMode) {
  items(name: $name, lang: $lang, gameMode: $gameMode) {
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