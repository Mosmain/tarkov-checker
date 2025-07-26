from websockets.server import WebSocketServerProtocol
from .state import connected_clients, last_sent_map
from .dispatcher import _make_message

async def websocket_handler(websocket: WebSocketServerProtocol) -> None:
    print(f"📶 Подключен клиент: {websocket.remote_address}")
    connected_clients.add(websocket)

    # Отправляем текущую карту сразу после подключения
    if "name" in last_sent_map:
        map_payload = _make_message("map", {"name": last_sent_map["name"]})
        await websocket.send(map_payload)
        print(f"📤 Отправлена текущая карта: {last_sent_map['name']}")

    try:
        async for _ in websocket:
            pass
    except:
        print("❌ Клиент отключился")
    finally:
        connected_clients.remove(websocket)
