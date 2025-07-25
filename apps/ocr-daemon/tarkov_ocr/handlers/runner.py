import threading
from typing import Callable
from pathlib import Path

from tarkov_ocr.handlers import watcher
from tarkov_ocr.handlers.location import start_location_finder

def run_watcher(callback: Callable[[Path], None]) -> None:
    """
    Запускает отслеживание скриншотов в отдельном потоке.
    """
    threading.Thread(
        target=watcher.start_watcher,
        args=(callback,),
        daemon=True,
        name="WatcherThread"
    ).start()


def run_location_finder() -> None:
    """
    Запускает отслеживание смены карты в отдельном потоке.
    """
    threading.Thread(
        target=start_location_finder,
        daemon=True,
        name="LocationFinderThread"
    ).start()


def run_all(callback: Callable[[Path], None]) -> None:
    """
    Запускает все фоновые сервисы:
    - наблюдатель скриншотов
    - наблюдатель смены карты
    """
    run_location_finder()
    run_watcher(callback)
