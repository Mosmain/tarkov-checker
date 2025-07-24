import json
import asyncio

from .state import connected_clients, latest_payload, last_sent_payload

async def broadcast_to_clients(data: dict) -> None:
    global last_sent_payload

    if not connected_clients:
        return

    if data == last_sent_payload:
        print("🔁 Пропускаем отправку — данные не изменились.")
        return

    last_sent_payload = data.copy()
    message = json.dumps(data, ensure_ascii=False)
    print(f"📢 Отправляем клиентам: {message}")

    tasks = [asyncio.create_task(client.send(message)) for client in connected_clients]
    await asyncio.gather(*tasks, return_exceptions=True)

async def push_item_name(name: str) -> None:
    print(f"📝 Получено имя предмета: {name}")
    latest_payload["item"] = name
    await broadcast_to_clients(latest_payload)
