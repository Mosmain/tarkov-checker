import asyncio
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from pathlib import Path
from typing import Callable, Awaitable
from tarkov_ocr.core import config

def start_watcher(callback: Callable[[Path], Awaitable[None]]) -> None:
    """
    Запускает наблюдатель за скриншотами.
    При появлении нового изображения вызывает async-callback с путём до файла.
    Использует потоковый Observer, безопасно вызывая coroutine через event loop.
    """
    screenshots_path = config.SCREENSHOTS_PATH
    screenshots_path.mkdir(parents=True, exist_ok=True)

    # Создаём и настраиваем отдельный event loop для текущего потока
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    class ScreenshotHandler(FileSystemEventHandler):
        def on_created(self, event):
            path = Path(event.src_path)
            if path.is_file() and path.suffix.lower() in [".png", ".jpg", ".jpeg"]:
                print(f"🕵️ Обнаружен файл: {path.name}")
                loop.call_soon_threadsafe(asyncio.create_task, callback(path))

    observer = Observer()
    observer.schedule(ScreenshotHandler(), str(screenshots_path), recursive=False)
    observer.start()

    print(f"👀 Вотчер следит за: {screenshots_path}")

    try:
        loop.run_forever()
    except KeyboardInterrupt:
        observer.stop()
        print("🛑 Вотчер остановлен вручную")
    finally:
        observer.join()
        loop.close()
