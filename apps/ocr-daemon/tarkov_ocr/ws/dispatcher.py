import json
from typing import Any

from tarkov_ocr.ws import state


async def broadcast_update(type_: str, data: dict[str, Any], *, force: bool = False) -> None:
    if type_ == "map":
        if not force and state.last_sent_map is not None and data == state.last_sent_map:
            return
        state.last_sent_map = data.copy()

    elif type_ == "location":
        if not force and state.last_sent_location is not None and data == state.last_sent_location:
            return
        state.last_sent_location = data.copy()

    message = json.dumps({"type": type_, "data": data}, ensure_ascii=False)

    for client in state.connected_clients.copy():
        try:
            await client.send(message)
        except Exception as e:
            print(f"❌ Ошибка при отправке клиенту: {e}")


async def broadcast_location_update(location: dict[str, Any]) -> None:
    await broadcast_update("location", location)


async def broadcast_map_update(map_name: str) -> None:
    await broadcast_update("map", {"name": map_name})


async def broadcast_item_update(item_with_status: dict[str, Any]) -> None:
    """Отправка информации о предмете, статус уже должен быть установлен (ready/cached)"""
    message = json.dumps({"type": "item", "data": item_with_status}, ensure_ascii=False)

    print(f"📦 Предмет — отправляем с флагом {item_with_status.get('status')}.")
    print(f"📢 Отправляем item: {message}")

    for client in state.connected_clients.copy():
        try:
            await client.send(message)
        except Exception as e:
            print(f"❌ Ошибка при отправке предмета клиенту: {e}")


async def broadcast_status(event: str, item_name: str) -> None:
    message = json.dumps(
        {"type": "status", "data": {"event": event, "item_name": item_name}},
        ensure_ascii=False,
    )
    for client in state.connected_clients.copy():
        try:
            await client.send(message)
        except Exception as e:
            print(f"❌ Ошибка при отправке статуса клиенту: {e}")


async def broadcast_error(message: str) -> None:
    payload = {
        "type": "error",
        "data": {
            "message": message
        }
    }

    json_str = json.dumps(payload, ensure_ascii=False)
    for client in state.connected_clients.copy():
        try:
            await client.send(json_str)
        except Exception as e:
            print(f"❌ Ошибка при отправке ошибки клиенту: {e}")
