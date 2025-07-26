import asyncio
from websockets.server import WebSocketServerProtocol

connected_clients: set[WebSocketServerProtocol] = set()

# Последние отправленные значения
last_sent_location = None
last_sent_item: dict = {}
last_sent_map = None

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
