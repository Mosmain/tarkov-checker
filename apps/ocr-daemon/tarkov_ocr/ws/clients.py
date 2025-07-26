import re
import json
from websockets.server import WebSocketServerProtocol

from tarkov_ocr.ws import state
from tarkov_ocr.core.client_settings import update_settings


async def websocket_handler(websocket: WebSocketServerProtocol) -> None:
    print(f"📶 Подключен клиент: {websocket.remote_address}")
    state.connected_clients.add(websocket)

    # Отправка последней карты при подключении
    if state.last_sent_map is not None:
        message = json.dumps({
            "type": "map",
            "data": state.last_sent_map,
        }, ensure_ascii=False)
        await websocket.send(message)
        print(f"📤 Отправлена текущая карта клиенту: {state.last_sent_map}")

    try:
        async for message in websocket:
            await handle_message(websocket, message)
    except Exception as e:
        print(f"❌ Клиент отключился: {e}")
    finally:
        state.connected_clients.remove(websocket)


def camel_to_snake(name: str) -> str:
    """Преобразование ключей из camelCase в snake_case"""
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


async def handle_message(websocket: WebSocketServerProtocol, message: str) -> None:
    try:
        data = json.loads(message)
    except json.JSONDecodeError:
        print(f"❌ Ошибка парсинга JSON: {message}")
        return

    msg_type = data.get("type")
    payload = data.get("data")
    if msg_type == "settings" and isinstance(payload, dict):
        # конвертим ключи в snake_case и обновляем настройки
        normalized = {camel_to_snake(k): v for k, v in payload.items()}
        update_settings(websocket, normalized)
    else:
        print(f"⚠️ Неизвестное сообщение: {data}")
