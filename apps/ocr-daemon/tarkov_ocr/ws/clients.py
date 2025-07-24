from websockets.server import WebSocketServerProtocol
from .state import connected_clients

async def websocket_handler(websocket: WebSocketServerProtocol) -> None:
    print(f"📶 Подключен клиент: {websocket.remote_address}")
    connected_clients.add(websocket)
    try:
        async for _ in websocket:
            pass
    except:
        print("❌ Клиент отключился")
    finally:
        connected_clients.remove(websocket)
