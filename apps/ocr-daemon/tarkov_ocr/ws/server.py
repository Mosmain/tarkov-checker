import asyncio
from threading import Thread
from watchdog.observers import Observer

from tarkov_ocr import config
from tarkov_ocr.handlers.screenshot import ScreenshotCreatedHandler
from tarkov_ocr.handlers.location import start_location_finder
from .clients import websocket_handler
from .state import loop
import websockets

async def run_websocket_server():
    print(f"🌐 WebSocket-сервер запущен на ws://{config.WS_HOST}:{config.WS_PORT}")
    print("🛠️ Ожидаем подключения клиентов...")

    observer = Observer()
    observer.schedule(ScreenshotCreatedHandler(), config.SCREENSHOTS_DIR, recursive=False)
    observer.start()

    Thread(target=start_location_finder, daemon=True).start()

    async with websockets.serve(websocket_handler, config.WS_HOST, config.WS_PORT):
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
        observer.join()
