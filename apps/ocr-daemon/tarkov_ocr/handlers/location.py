import asyncio
from tarkov_ocr import config
from tarkov_ocr.map_finder import LocationFinder
from tarkov_ocr.ws.dispatcher import broadcast_to_clients
from tarkov_ocr.ws.state import loop

def on_location_change(map_name: str):
    print(f"🗺️ Новая карта: {map_name}")
    loop.call_soon_threadsafe(
        asyncio.create_task,
        broadcast_to_clients({"type": "location", "map": map_name})
    )

def start_location_finder():
    finder = LocationFinder(path=config.LOG_PATH, interval=5)
    finder.startWatch(on_change=on_location_change)
