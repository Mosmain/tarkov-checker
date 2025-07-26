import pyautogui
from typing import Tuple


class MouseContext:
    """
    Контекст для работы с курсором мыши.
    """
    def get_position(self) -> Tuple[int, int]:
        """
        Возвращает текущие координаты курсора (x, y)
        """
        x, y = pyautogui.position()
        return x, y
