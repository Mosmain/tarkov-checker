from tarkov_ocr import watcher, mouse, cropper, ocr, items
from tarkov_ocr.ws import run_websocket_server, loop, push_item_name
from pathlib import Path
import threading
import time
import asyncio

def on_new_screenshot(path: Path):
    x, y = mouse.get_cursor_position()
    print(f"🖱️ Координаты курсора: {x}, {y}")

    print(f"⚙️ Обработка скриншота: {path}")
    time.sleep(0.3)

    cropped = cropper.crop_around_cursor(path, x, y)
    text = ocr.extract_text(cropped)

    if text:
        print(f"🔤 Распознанный текст: {text}")
        loop.call_soon_threadsafe(asyncio.create_task, push_item_name(text))
    else:
        print("❌ Текст не распознан")

def run_watcher():
    watcher.start_watcher(on_new_screenshot)

def main():
    print("🧠 Загрузка списка предметов Tarkov...")
    item_names = items.load_items()
    print(f"✅ Загружено {len(item_names)} предметов")

    print("🔄 Запуск OCR-демона и WebSocket-сервера...")
    threading.Thread(target=run_watcher, daemon=True).start()
    loop.run_until_complete(run_websocket_server())

if __name__ == "__main__":
    main()
