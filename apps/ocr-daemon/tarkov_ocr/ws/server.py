import asyncio
from threading import Thread
import websockets

from tarkov_ocr.core import config
from tarkov_ocr.handlers.location import start_location_finder
from .clients import websocket_handler
from .state import loop


async def run_websocket_server():
    print(f"🌐 WebSocket-сервер запущен на ws://{config.WS_HOST}:{config.WS_PORT}")
    print("🛠️ Ожидаем подключения клиентов...")

    # Отдельный поток отслеживает смену карты
    Thread(target=start_location_finder, daemon=True).start()

    async with websockets.serve(websocket_handler, config.WS_HOST, config.WS_PORT):
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            print("🛑 WebSocket-сервер остановлен вручную")
