import json
import asyncio

from .state import connected_clients, last_sent_location, last_sent_item

async def broadcast_location_update(payload: dict) -> None:
    if not connected_clients:
        return

    if payload == last_sent_location:
        print("🔁 Пропускаем отправку координат — данные не изменились.")
        return

    last_sent_location.clear()
    last_sent_location.update(payload)

    message = json.dumps(payload, ensure_ascii=False)
    print(f"📢 Отправляем координаты: {message}")

    tasks = [asyncio.create_task(client.send(message)) for client in connected_clients]
    await asyncio.gather(*tasks, return_exceptions=True)

async def broadcast_item_update(item: dict) -> None:
    if not connected_clients or not item:
        return

    if item == last_sent_item:
        print("🔁 Пропускаем отправку предмета — данные не изменились.")
        return

    last_sent_item.clear()
    last_sent_item.update(item)

    message = json.dumps({"item": item}, ensure_ascii=False)
    print(f"📦 Отправляем предмет: {item.get('name', '[без имени]')}")
    print(f"📢 Отправляем клиентам: {message}")

    tasks = [asyncio.create_task(client.send(message)) for client in connected_clients]
    await asyncio.gather(*tasks, return_exceptions=True)
