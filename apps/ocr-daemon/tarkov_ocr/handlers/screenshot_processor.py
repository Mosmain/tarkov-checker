import asyncio
from pathlib import Path
from typing import Sequence

from tarkov_ocr.core import fuzz
from tarkov_ocr.handlers import cropper, mouse, ocr, screenshot
from tarkov_ocr.utils.filesystem import wait_for_file_ready
from tarkov_ocr.ws import loop
from tarkov_ocr.ws.dispatcher import broadcast_to_clients

class ScreenshotProcessor:
    def __init__(self, item_names: Sequence[str]):
        self.normalized_items = fuzz.prepare_normalized_map(item_names)

    def handle(self, path: Path) -> None:
        # Обновляем latest_payload координатами из имени файла
        screenshot.handle_screenshot_created(path)

        # Дожидаемся полной готовности файла
        if not wait_for_file_ready(path):
            print("❌ Файл не готов к чтению. Пропуск...")
            return

        x, y = mouse.get_cursor_position()
        print(f"🖱️ Координаты курсора: {x}, {y}")
        print(f"⚙️ Обработка скриншота: {path.name}")

        cropped = cropper.crop_around_cursor(path, x, y)
        ocr_text = ocr.extract_text(cropped)

        payload = screenshot.latest_payload.copy()

        if not ocr_text:
            print("❌ Текст не распознан")
            loop.call_soon_threadsafe(asyncio.create_task, broadcast_to_clients(payload))
            return

        print(f"🔤 OCR: {ocr_text}")
        match = fuzz.best_match(ocr_text, self.normalized_items)

        if match:
            name, score = match
            print(f"🎯 Совпадение: {name} ({score:.1f}%)")
            payload["item"] = name
        else:
            print("❌ Совпадений не найдено")

        loop.call_soon_threadsafe(asyncio.create_task, broadcast_to_clients(payload))
