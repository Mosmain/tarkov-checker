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
    items(name: $name, lang: ru) {
        name
        avg24hPrice
        basePrice
        iconLink
        properties {
            ... on ItemPropertiesAmmo {
                damage
                penetrationPower
            }
            # другие inline-фрагменты...
        }
    }
}
"""
