import asyncio
import threading
import time
from pathlib import Path

from tarkov_ocr.api import cache
from tarkov_ocr.core import fuzz
from tarkov_ocr.handlers import cropper, mouse, ocr, screenshot, watcher
from tarkov_ocr.ws import loop, run_websocket_server
from tarkov_ocr.ws.dispatcher import broadcast_to_clients


def create_screenshot_handler(item_names: list[str]):
    normalized_items = fuzz.prepare_normalized_map(item_names)

    def handle(path: Path):
        # Обновляем latest_payload координатами
        screenshot.handle_screenshot_created(path)

        x, y = mouse.get_cursor_position()
        print(f"🖱️ Координаты курсора: {x}, {y}")
        print(f"⚙️ Обработка скриншота: {path.name}")
        time.sleep(0.3)

        cropped = cropper.crop_around_cursor(path, x, y)
        ocr_text = ocr.extract_text(cropped)

        payload = screenshot.latest_payload.copy()

        if not ocr_text:
            print("❌ Текст не распознан")
            # ❗️Больше не добавляем "item": "❌ Не распознан"
            loop.call_soon_threadsafe(asyncio.create_task, broadcast_to_clients(payload))
            return

        print(f"🔤 OCR: {ocr_text}")
        match = fuzz.best_match(ocr_text, normalized_items)

        if match:
            name, score = match
            print(f"🎯 Совпадение: {name} ({score:.1f}%)")
            payload["item"] = name
        else:
            print("❌ Совпадений не найдено")
            # ❗️Не добавляем поле "item" вообще

        loop.call_soon_threadsafe(asyncio.create_task, broadcast_to_clients(payload))



    return handle


def run_watcher(item_names: list[str]):
    callback = create_screenshot_handler(item_names)
    watcher.start_watcher(callback)


def main():
    print("📦 Загрузка списка предметов...")
    item_names = cache.get_items()

    print("🔄 Запуск OCR-демона и WebSocket-сервера...")
    threading.Thread(target=run_watcher, args=(item_names,), daemon=True).start()
    loop.run_until_complete(run_websocket_server())


if __name__ == "__main__":
    main()
