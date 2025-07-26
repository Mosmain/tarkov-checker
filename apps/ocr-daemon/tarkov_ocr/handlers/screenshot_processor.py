import asyncio
from pathlib import Path
from typing import Sequence

from tarkov_ocr.core import fuzz
from tarkov_ocr.handlers import cropper, mouse, ocr, screenshot
from tarkov_ocr.utils.filesystem import wait_for_file_ready
from tarkov_ocr.ws import loop
from tarkov_ocr.ws.dispatcher import broadcast_item_update, broadcast_location_update
from tarkov_ocr.api.item import fetch_item_details


class ScreenshotProcessor:
    def __init__(self, item_names: Sequence[str]):
        self.normalized_items = fuzz.prepare_normalized_map(item_names)

    def handle(self, path: Path) -> None:
        # Парсим скриншот -> формируем координатный payload
        coords = screenshot.parse_screenshot_name(path.name)
        if not coords:
            print("❌ Не удалось распарсить имя скриншота")
            return

        print(f"📸 Новый скриншот: {path.name}")
        print(f"📊 Обновлённые данные: {coords}")

        # Сразу отправляем координаты клиенту
        asyncio.run_coroutine_threadsafe(broadcast_location_update(coords), loop)

        # Дожидаемся полной готовности файла
        if not wait_for_file_ready(path):
            print("❌ Файл не готов к чтению. Пропуск...")
            return

        x, y = mouse.get_cursor_position()
        print(f"🖱️ Координаты курсора: {x}, {y}")
        print(f"⚙️ Обработка скриншота: {path.name}")

        cropped = cropper.crop_around_cursor(path, x, y)
        ocr_text = ocr.extract_text(cropped)

        if not ocr_text:
            print("❌ Текст не распознан")
            return

        print(f"🔤 OCR: {ocr_text}")
        match = fuzz.best_match(ocr_text, self.normalized_items)

        if not match:
            print("❌ Совпадений не найдено")
            return

        name, score = match
        print(f"🎯 Совпадение: {name} ({score:.1f}%)")

        try:
            item_details = fetch_item_details(name)
            if item_details:
                print(f"📦 Детали предмета получены: {item_details['name']}")
                asyncio.run_coroutine_threadsafe(broadcast_item_update(item_details), loop)
            else:
                print("⚠️ Не удалось получить детали предмета")
        except Exception as e:
            print(f"❌ Ошибка при обработке предмета: {e}")
