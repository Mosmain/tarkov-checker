import asyncio
import websockets
import json
import re
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from tarkov_ocr import config

connected_clients = set()
latest_payload = {}


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
        print(f"[parse error] {filename}: {e}")
        return None


async def broadcast_to_clients(data: dict) -> None:
    if not connected_clients:
        return
    message = json.dumps(data, ensure_ascii=False)
    print(f"📢 Отправляем клиентам: {message}")
    tasks = [asyncio.create_task(client.send(message)) for client in connected_clients]
    await asyncio.gather(*tasks, return_exceptions=True)


async def push_item_name(name: str) -> None:
    print(f"📝 Получено имя предмета: {name}")
    latest_payload["item"] = name
    await broadcast_to_clients(latest_payload)


class ScreenshotCreatedHandler(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory and event.src_path.lower().endswith(".png"):
            filename = Path(event.src_path).name
            print(f"📸 Новый скриншот: {filename}")
            parsed_data = parse_screenshot_name(filename)
            if parsed_data:
                latest_payload.clear()
                latest_payload.update(parsed_data)
                print(f"📊 Обновлённые данные: {latest_payload}")
                asyncio.run_coroutine_threadsafe(broadcast_to_clients(latest_payload), loop)


async def websocket_handler(websocket):
    print(f"📶 Подключен клиент: {websocket.remote_address}")
    connected_clients.add(websocket)
    try:
        async for _ in websocket:
            pass
    except websockets.exceptions.ConnectionClosed:
        print("❌ Клиент отключился")
    finally:
        connected_clients.remove(websocket)


async def run_websocket_server():
    print(f"🌐 WebSocket-сервер запущен на ws://{config.WS_HOST}:{config.WS_PORT}")
    print("🛠️ Ожидаем подключения клиентов...")

    observer = Observer()
    observer.schedule(ScreenshotCreatedHandler(), config.SCREENSHOTS_DIR, recursive=False)
    observer.start()

    async with websockets.serve(websocket_handler, config.WS_HOST, config.WS_PORT):
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            observer.stop()
        observer.join()


loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
