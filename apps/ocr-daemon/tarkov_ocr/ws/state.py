import asyncio
from websockets.server import WebSocketServerProtocol

connected_clients: set[WebSocketServerProtocol] = set()
latest_payload: dict = {}
last_sent_payload: dict = {}

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
