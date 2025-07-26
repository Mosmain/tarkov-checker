import logging
from threading import Thread
from pathlib import Path
from typing import Callable

from tarkov_ocr.handlers import watcher
from tarkov_ocr.handlers.location import start_location_finder


def run_watcher(callback: Callable[[Path], None]) -> None:
    """
    Запускает наблюдение за скриншотами в отдельном потоке.
    """
    logging.debug("🔁 Запуск потока наблюдения за скриншотами (WatcherThread)")
    Thread(
        target=watcher.start_watcher,
        args=(callback,),
        daemon=True,
        name="WatcherThread",
    ).start()


def run_location_finder() -> None:
    """
    Запускает слежение за логами клиента Tarkov для определения текущей карты.
    """
    logging.debug("🔁 Запуск потока определения карты (LocationFinderThread)")
    Thread(
        target=start_location_finder,
        daemon=True,
        name="LocationFinderThread",
    ).start()


def run_all(callback: Callable[[Path], None]) -> None:
    """
    Запускает все фоновые сервисы:
    - отслеживание скриншотов
    - отслеживание смены карты
    """
    logging.debug("🚀 Запуск всех фоновых сервисов...")
    run_location_finder()
    run_watcher(callback)
