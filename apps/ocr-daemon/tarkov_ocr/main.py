from tarkov_ocr import watcher, mouse, cropper, ocr, items, fuzz
from tarkov_ocr.ws import run_websocket_server, loop, push_item_name
from pathlib import Path
import threading
import time
import asyncio

# Список предметов будет доступен в любом колбэке
item_names = []

def on_new_screenshot(path: Path):
    x, y = mouse.get_cursor_position()
    print(f"🖱️ Координаты курсора: {x}, {y}")

    print(f"⚙️ Обработка скриншота: {path.name}")
    time.sleep(0.3)

    cropped = cropper.crop_around_cursor(path, x, y)
    ocr_text = ocr.extract_text(cropped)

    if not ocr_text:
        print("❌ Текст не распознан")
        return

    print(f"🔤 OCR: {ocr_text}")

    item_names = items.get_items()
    normalized_items = fuzz.prepare_normalized_map(item_names)
    match = fuzz.best_match(ocr_text, normalized_items)

    if match:
        name, score = match
        print(f"🎯 Совпадение: {name} ({score:.1f}%)")
        loop.call_soon_threadsafe(asyncio.create_task, push_item_name(name))
    else:
        print("❌ Совпадений не найдено")
        loop.call_soon_threadsafe(asyncio.create_task, push_item_name("❌ Не найдено"))

def run_watcher():
    watcher.start_watcher(on_new_screenshot)

def main():
    global item_names
    item_names = items.get_items()

    print("🔄 Запуск OCR-демона и WebSocket-сервера...")
    threading.Thread(target=run_watcher, daemon=True).start()
    loop.run_until_complete(run_websocket_server())

if __name__ == "__main__":
    main()
