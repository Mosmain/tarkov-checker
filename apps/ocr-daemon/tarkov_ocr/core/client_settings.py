from websockets.server import WebSocketServerProtocol
from tarkov_ocr.api.constants import DEFAULT_DELETE_SCREENSHOTS, DEFAULT_LANG, DEFAULT_GAME_MODE

client_settings: dict[WebSocketServerProtocol, dict] = {}

DEFAULT_SETTINGS = {
    "lang": DEFAULT_LANG,
    "game_mode": DEFAULT_GAME_MODE,
    "delete_screenshots": DEFAULT_DELETE_SCREENSHOTS,
}

def update_settings(websocket: WebSocketServerProtocol, new_settings: dict) -> None:
    current = client_settings.get(websocket, DEFAULT_SETTINGS.copy())
    current.update({k: v for k, v in new_settings.items() if k in DEFAULT_SETTINGS})
    client_settings[websocket] = current
    print(f"⚙️ Настройки клиента обновлены: {current}")


def get_settings(websocket: WebSocketServerProtocol | None = None) -> dict:
    """Получить настройки клиента. Если не указан, использовать последнего клиента или дефолт"""
    if websocket and websocket in client_settings:
        return client_settings[websocket]

    # Попробовать взять первого подключённого клиента
    if client_settings:
        return next(iter(client_settings.values()))

    return DEFAULT_SETTINGS.copy()
