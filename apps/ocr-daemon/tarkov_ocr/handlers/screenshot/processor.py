from pathlib import Path
from PIL.Image import Image
import os

from tarkov_ocr.api.item import fetch_item_details
from tarkov_ocr.core.client_settings import get_settings
from tarkov_ocr.utils.filesystem import wait_for_file_ready
from tarkov_ocr.ws.dispatcher import (
    broadcast_item_update,
    broadcast_location_update,
    broadcast_status,
    broadcast_error,
)
from tarkov_ocr.ws.item_cache import ItemCache
from tarkov_ocr.handlers.screenshot.context import ScreenshotContext
from tarkov_ocr.handlers.screenshot.identifier import ItemIdentifier


class ScreenshotProcessor:
    def __init__(self, item_names: list[str]) -> None:
        self.ctx = ScreenshotContext(item_names)
        self.identifier = ItemIdentifier(item_names)
        self.cache = ItemCache()

    async def handle(self, path: Path) -> None:
        await self._handle_metadata(path)
        if not wait_for_file_ready(path):
            print("❌ Файл не готов к чтению. Пропуск...")
            return
        await self._process_item(path)

    async def _handle_metadata(self, path: Path) -> None:
        metadata = self.ctx.parse_metadata(path.name)
        if metadata:
            print(f"📸 Новый скриншот (с координатами): {path.name}")
            print(f"📊 Обновлённые данные: {metadata}")
            await broadcast_location_update(metadata)
        else:
            print(f"📸 Новый скриншот (БЕЗ координат): {path.name}")
            print("ℹ️ Обработка без координат (предположительно: схрон)")

    async def _process_item(self, path: Path) -> None:
        x, y = self.ctx.get_cursor()
        print(f"🖱️ Координаты курсора: {x}, {y}")
        print(f"⚙️ Обработка скриншота: {path.name}")

        cropped = self.ctx.crop(path, x, y)
        match = self.identifier.identify(cropped)

        try:
            if not match:
                print("❌ Текст не распознан или совпадений не найдено")
                await broadcast_error("Не удалось распознать текст предмета")
                self._dump_failed(path, cropped)
                return

            name, score, *_ = match
            print(f"🎯 Совпадение: {name} ({score:.1f}%)")
            await broadcast_status("fetching", item_name=name)

            if self.cache.is_duplicate(name):
                cached = self.cache.get_cached()
                if cached:
                    await broadcast_item_update(cached)
                return

            settings = get_settings()
            item = fetch_item_details(
                name,
                lang=settings.get("lang", "en"),
                game_mode=settings.get("game_mode", "regular"),
            )
            if item:
                item_with_status = self.cache.update(item)
                await broadcast_item_update(item_with_status)
            else:
                print(f"⚠️ GraphQL вернул пустой ответ для предмета: {name}")

        except Exception as e:
            print(f"❌ Ошибка при обработке предмета: {e}")
            await broadcast_error(str(e))

        finally:
            if get_settings().get("delete_screenshots", False):
                try:
                    path.unlink()
                    print(f"🧹 Скриншот удалён: {path}")
                except Exception as e:
                    print(f"❌ Ошибка при удалении скриншота: {e}")

    def _dump_failed(self, path: Path, image: Image) -> None:
        dump_dir = Path("dump")
        dump_dir.mkdir(exist_ok=True)
        image.save(dump_dir / path.name)



# 🛠 Если хочешь довести его до production-ready:
#  Добавь глобальное логгирование;

#  Покрой ключевую логику handlers юнит-тестами;

#  Перенеси параметры в .env/yaml;

#  Внедри линтер (ruff, black, isort);

#  Подключи mypy/pyright.

# Если хочешь — могу помочь настроить всё это по шагам.