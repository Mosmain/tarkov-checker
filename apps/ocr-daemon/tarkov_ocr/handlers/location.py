import asyncio
from tarkov_ocr.core import config
from tarkov_ocr.handlers.map_finder import LocationFinder
from tarkov_ocr.ws.dispatcher import broadcast_map_update
from tarkov_ocr.ws.state import loop

def on_location_change(map_name: str):
    loop.call_soon_threadsafe(
        asyncio.create_task,
        broadcast_map_update(map_name)
    )

def start_location_finder():
    finder = LocationFinder(path=config.LOGS_PATH, interval=5)
    finder.startWatch(on_change=on_location_change)
