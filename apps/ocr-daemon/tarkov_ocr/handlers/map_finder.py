#!/usr/bin/env python3
"""EFT Location Finder — с callback на смену карты
================================================

Минимальное использование:

```python
from eft_location import LocationFinder

async def send_to_ws(map_name: str):
    await ws.send({"type": "location", "map": map_name})

LocationFinder(path=LOGS_PATH, interval=5).startWatch(on_change=send_to_ws)
```
"""
import asyncio
import logging
import re
import time
from pathlib import Path
from typing import Callable, Iterator, List, Optional, Union

__all__ = ["LocationFinder"]

_LOCATION_RE = re.compile(r"Locations?:\s*([A-Za-z0-9_ ]+)", re.IGNORECASE)

Callback = Callable[[str], "asyncio.Future | None | object"]


class LocationFinder:
    """Отслеживает текущую карту Escape from Tarkov.

    Parameters
    ----------
    path : str | Path
        Путь к папке `Logs`.
    interval : int, default 15
        Интервал опроса (секунды).
    """

    def __init__(self, *, path: Union[str, Path], interval: int = 15):
        self.logs_dir = Path(path)
        self.interval = max(1, int(interval))
        self._prev: Optional[str] = None

    # ---------------- internal helpers -------------------
    @staticmethod
    def _newest(paths: List[Path]) -> Optional[Path]:
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
                    m = _LOCATION_RE.search(line)
                    if m:
                        last = m.group(1).strip()
        except FileNotFoundError:
            logging.warning("Log file vanished: %s", file)
        return last

    # ---------------- public API -------------------------
    def find(self) -> Optional[str]:
        """Вернуть текущую карту или *None*."""
        folder = self._latest_folder()
        if folder is None:
            logging.debug("No log folders in %s", self.logs_dir)
            return None

        traces = self._latest_traces(folder)
        if traces is None:
            logging.debug("No *traces.log in %s", folder)
            return None
        return self._extract_location(traces)

    def poll(self) -> Iterator[str]:
        """Генератор — выдаёт карту, когда она изменилась."""
        while True:
            curr = self.find()
            if curr and curr != self._prev:
                self._prev = curr
                yield curr
            time.sleep(self.interval)

    # -----------------------------------------------------
    def startWatch(self, *, on_change: Optional[Callback] = None) -> "LocationFinder":
        """Запускает бесконечный цикл; при смене карты вызывает *on_change*.

        Parameters
        ----------
        on_change : Callable[[str], Awaitable[Any] | None]
            Синхронная функция или async‑функция, принимающая название карты.
        """

        for loc in self.poll():
            if on_change is None:
                continue

            if asyncio.iscoroutinefunction(on_change):
                coro = on_change(loc)  # type: ignore[arg-type]
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    # Нет запущенного цикла – выполняем корутину синхронно
                    asyncio.run(coro)
                else:
                    # Планируем корутину в существующем цикле без лямбда‑обёртки
                    loop.call_soon_threadsafe(asyncio.create_task, coro)
            else:
                try:
                    on_change(loc)
                except Exception as exc:  # noqa: BLE001
                    logging.exception("Callback on_change raised an error: %s", exc)
        return self
