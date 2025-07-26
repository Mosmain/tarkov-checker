import asyncio
from pathlib import Path
import re

from tarkov_ocr.ws.dispatcher import broadcast_location_update
from tarkov_ocr.ws.state import loop

def parse_screenshot_name(filename: str) -> dict | None:
    name = Path(filename).stem
    parts = name.split("_")

    if len(parts) < 4:
        return None

    try:
        datetime_raw = parts[0]
        coords = [round(float(x.strip()), 2) for x in parts[1].split(",")]
        quat = [round(float(x.strip()), 2) for x in parts[2].split(",")]

        match = re.search(r"([-+]?\d*\.\d+|\d+)", parts[3])
        extra = float(match.group(1)) if match else None

        return {
            "datetime": datetime_raw,
            "position": coords,
            "quaternion": quat,
            "extra": extra,
        }
    except Exception as e:
        print(f"[❌ parse error] {filename}: {e}")
        return None

def handle_screenshot_created(path: Path) -> dict | None:
    filename = path.name
    print(f"📸 Новый скриншот: {filename}")

    parsed = parse_screenshot_name(filename)
    if parsed:
        print(f"📊 Обновлённые данные: {parsed}")
        loop.call_soon_threadsafe(
            asyncio.create_task,
            broadcast_location_update(parsed)
        )
        return parsed
    return None
