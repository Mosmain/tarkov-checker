import pyautogui
from typing import Tuple

def get_cursor_position() -> Tuple[int, int]:
    """
    Возвращает текущие координаты курсора (x, y)
    """
    x, y = pyautogui.position()
    return x, y
