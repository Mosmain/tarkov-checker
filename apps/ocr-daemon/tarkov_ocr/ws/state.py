import asyncio
from websockets.server import WebSocketServerProtocol

connected_clients: set[WebSocketServerProtocol] = set()
last_sent_location: dict = {}
last_sent_item: dict = {}
last_sent_map: dict = {}

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
