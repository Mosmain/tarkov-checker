from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from pathlib import Path
import time
from typing import Callable
from tarkov_ocr import config

class ScreenshotHandler(FileSystemEventHandler):
    def __init__(self, on_new_image: Callable[[Path], None]):
        super().__init__()
        self.on_new_image = on_new_image  # ✅ сохраняем в on_new_image

    def on_created(self, event):
        path = Path(event.src_path)
        if path.is_file() and path.suffix.lower() in [".png", ".jpg", ".jpeg"]:
            print(f"🖼️ Найден новый скриншот: {path.name}")
            self.on_new_image(path)  # ✅ вызываем корректно

def start_watcher(callback: Callable[[Path], None]) -> None:
    screenshots_dir = config.SCREENSHOTS_DIR
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    event_handler = ScreenshotHandler(callback)
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
