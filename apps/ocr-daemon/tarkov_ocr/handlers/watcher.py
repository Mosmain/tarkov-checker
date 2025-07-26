from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from pathlib import Path
import time
from typing import Callable
from tarkov_ocr.core import config

def start_watcher(callback: Callable[[Path], None]) -> None:
    """
    Запускает наблюдатель за скриншотами.
    При появлении нового изображения вызывает callback с путём до файла.
    """
    screenshots_dir = config.SCREENSHOTS_DIR
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    class ScreenshotHandler(FileSystemEventHandler):
        def on_created(self, event):
            path = Path(event.src_path)
            if path.is_file() and path.suffix.lower() in [".png", ".jpg", ".jpeg"]:
                print(f"🕵️ Обнаружен файл: {path.name}")
                callback(path)

    event_handler = ScreenshotHandler()
    observer = Observer()
    observer.schedule(event_handler, str(screenshots_dir), recursive=False)
    observer.start()

    print(f"👀 Вотчер следит за: {screenshots_dir}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        print("🛑 Вотчер остановлен вручную")
    observer.join()
