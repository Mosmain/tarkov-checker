import asyncio
from tarkov_ocr.core import config
from tarkov_ocr.handlers.map_finder import LocationFinder
from tarkov_ocr.ws.dispatcher import broadcast_map_update
from tarkov_ocr.ws.state import loop


def _on_location_change(map_name: str) -> None:
    """
    Обработчик события смены локации. Отправляет обновление по WebSocket.
    """
    loop.call_soon_threadsafe(
        asyncio.create_task,
        broadcast_map_update(map_name)
    )


def start_location_finder() -> None:
    """
    Запускает наблюдение за логами клиента игры для отслеживания смены карты.
    Также инициализирует карту при старте.
    """
    finder = LocationFinder(path=config.LOGS_PATH, interval=5)

    # Форсируем определение текущей карты (до старта watch)
    initial_map = finder._find()  # напрямую вызываем внутренний метод
    if initial_map:
        finder._prev = initial_map  # сохранить, чтобы не сработал повторный on_change
        print(f"🧭 Последняя карта: {initial_map}")
        loop.call_soon_threadsafe(
            asyncio.create_task,
            broadcast_map_update(initial_map)
        )

    # Стартуем вотчер
    finder.start_watch(on_change=_on_location_change)
