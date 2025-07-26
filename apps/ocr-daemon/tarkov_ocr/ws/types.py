from enum import Enum

class ItemStatus(str, Enum):
    READY = "ready"
    CACHED = "cached"
