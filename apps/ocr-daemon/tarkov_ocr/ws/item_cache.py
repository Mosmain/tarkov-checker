from copy import deepcopy
from tarkov_ocr.ws.types import ItemStatus

class ItemCache:
    def __init__(self) -> None:
        self._last_item: dict | None = None

    def is_duplicate(self, name: str) -> bool:
        return self._last_item is not None and self._last_item.get("name") == name

    def update(self, item: dict) -> dict:
        """Сохраняем новый предмет с флагом READY"""
        item_with_status = deepcopy(item)
        item_with_status["status"] = ItemStatus.READY
        self._last_item = deepcopy(item_with_status)
        return item_with_status

    def get_cached(self) -> dict | None:
        """Возвращает последний предмет со статусом CACHED (если есть)"""
        if self._last_item is None:
            return None
        cached_item = deepcopy(self._last_item)
        cached_item["status"] = ItemStatus.CACHED
        return cached_item
