import json
import asyncio
from typing import Literal

from .state import connected_clients, last_sent_location, last_sent_item, last_sent_map

MessageType = Literal["location", "item", "map", "error"]

def _make_message(type_: MessageType, data: dict, message: str | None = None) -> str:
    payload = {
        "type": type_,
        "data": data
    }
    if message:
        payload["message"] = message
    return json.dumps(payload, ensure_ascii=False)


async def _broadcast_json(message: str) -> None:
    if not connected_clients:
        return

    tasks = [asyncio.create_task(client.send(message)) for client in connected_clients]
    await asyncio.gather(*tasks, return_exceptions=True)


async def broadcast_location_update(data: dict) -> None:
    if data == last_sent_location:
        print("🔁 Пропускаем отправку координат — данные не изменились.")
        return

    last_sent_location.clear()
    last_sent_location.update(data)

    message = _make_message("location", data)
    print(f"📢 Отправляем координаты: {message}")
    await _broadcast_json(message)


async def broadcast_item_update(data: dict) -> None:
    if not data or data == last_sent_item:
        print("🔁 Пропускаем отправку предмета — данные не изменились.")
        return

    last_sent_item.clear()
    last_sent_item.update(data)

    msg_text = f"Предмет: {data.get('name', '[без имени]')}"
    message = _make_message("item", data)
    print(f"📦 Отправляем предмет: {msg_text}")
    await _broadcast_json(message)

async def broadcast_map_update(map_name: str) -> None:
    if last_sent_map.get("name") == map_name:
        print("🔁 Пропускаем отправку карты — данные не изменились.")
        return

    last_sent_map.clear()
    last_sent_map["name"] = map_name

    data = {"name": map_name}
    message = _make_message("map", data)
    print(f"🗺️ Новая карта: {map_name}")
    await _broadcast_json(message)

async def broadcast_error(error_message: str) -> None:
    error_data = {"code": "generic_error"}  # можно передавать и другие поля
    message = _make_message("error", error_data, error_message)
    print(f"❌ Ошибка: {error_message}")
    await _broadcast_json(message)
