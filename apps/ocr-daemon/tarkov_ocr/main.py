from tarkov_ocr.api import cache
from tarkov_ocr.handlers import runner
from tarkov_ocr.handlers.screenshot_processor import ScreenshotProcessor
from tarkov_ocr.ws import run_websocket_server, loop

def main():
    print("📦 Загрузка списка предметов...")
    item_names = cache.get_items()

    # Инициализируем процессор скриншотов
    processor = ScreenshotProcessor(item_names)

    print("🔄 Запуск фоновых процессов...")
    runner.run_all(callback=processor.handle)

    print("🚀 Запуск WebSocket-сервера...")
    loop.run_until_complete(run_websocket_server())


if __name__ == "__main__":
    main()
