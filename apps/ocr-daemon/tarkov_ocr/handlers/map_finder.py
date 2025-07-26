import asyncio
import logging
import re
import time
from pathlib import Path
from typing import Callable, Iterator, List, Optional, Union

_LOCATION_RE = re.compile(r"Locations?:\s*([A-Za-z0-9_ ]+)", re.IGNORECASE)
LocationCallback = Callable[[str], Optional[object]]


class LocationFinder:
    """
    Отслеживает смену карты по логам Escape from Tarkov.

    :param path: Путь до директории `Logs/`.
    :param interval: Интервал опроса в секундах (по умолчанию 15).
    """

    def __init__(self, *, path: Union[str, Path], interval: int = 15):
        self.logs_dir = Path(path)
        self.interval = max(1, interval)
        self._prev: Optional[str] = None

    def _newest(self, paths: List[Path]) -> Optional[Path]:
        return max(paths, key=lambda p: p.stat().st_mtime) if paths else None

    def _latest_folder(self) -> Optional[Path]:
        return self._newest([p for p in self.logs_dir.iterdir() if p.is_dir()])

    def _latest_traces(self, folder: Path) -> Optional[Path]:
        return self._newest(list(folder.glob("*traces.log")))

    def _extract_location(self, file: Path) -> Optional[str]:
        last = None
        try:
            with file.open("r", encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    match = _LOCATION_RE.search(line)
                    if match:
                        last = match.group(1).strip()
        except FileNotFoundError:
            logging.warning("Log file vanished: %s", file)
        return last

    def _find(self) -> Optional[str]:
        folder = self._latest_folder()
        if not folder:
            logging.debug("No log folders in %s", self.logs_dir)
            return None

        traces = self._latest_traces(folder)
        if not traces:
            logging.debug("No *traces.log in %s", folder)
            return None

        return self._extract_location(traces)

    def _poll(self) -> Iterator[str]:
        while True:
            current = self._find()
            if current and current != self._prev:
                self._prev = current
                yield current
            time.sleep(self.interval)

    def get_current_location(self) -> Optional[str]:
        """
        Возвращает последнюю определённую карту, если есть.
        """
        return self._prev

    def start_watch(self, *, on_change: Optional[LocationCallback] = None) -> "LocationFinder":
        """
        Запускает отслеживание карты. При смене карты вызывает `on_change`.

        :param on_change: Функция или корутина, принимающая название карты.
        """
        for location in self._poll():
            if on_change is None:
                continue

            if asyncio.iscoroutinefunction(on_change):
                coro = on_change(location)  # type: ignore
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    asyncio.run(coro)
                else:
                    loop.call_soon_threadsafe(asyncio.create_task, coro)
            else:
                try:
                    on_change(location)
                except Exception as exc:
                    logging.exception("Callback on_change raised an error: %s", exc)

        return self
