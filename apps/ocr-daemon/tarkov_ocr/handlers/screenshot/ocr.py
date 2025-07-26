from typing import Optional
from PIL import Image
import numpy as np
import easyocr
import torch


class OCRContext:
    """
    Контекст для OCR-распознавания. Обрабатывает изображение, сортирует строки,
    выводит отладочную информацию и возвращает итоговый текст.
    """
    def __init__(self) -> None:
        # Ленивое создание OCR-ридера
        self.reader: Optional[easyocr.Reader] = None

    def _init_reader(self) -> None:
        if self.reader is None:
            print("📖 Инициализация EasyOCR Reader...")
            self.reader = easyocr.Reader(['ru', 'en'], gpu=torch.cuda.is_available())

    def extract_text(self, image: Image.Image) -> Optional[str]:
        self._init_reader()
        result = self.reader.readtext(np.array(image))
        if not result:
            return None

        # Пороговое значение по высоте строки
        LINE_HEIGHT_THRESHOLD = 10

        # [(позиция: (x, y), текст: str, уверенность: float)]
        items = [
            ((min(pt[0] for pt in box), min(pt[1] for pt in box)), text, conf)
            for box, text, conf in result
        ]
        items.sort(key=lambda item: item[0][1])  # сортировка по Y (вверх-вниз)

        # Группировка по строкам
        lines = []
        current_line = []
        last_y = None

        for (x, y), text, conf in items:
            if last_y is None or abs(y - last_y) < LINE_HEIGHT_THRESHOLD:
                current_line.append(((x, y), text, conf))
            else:
                lines.append(sorted(current_line, key=lambda item: item[0][0]))  # сортировка по X
                current_line = [((x, y), text, conf)]
            last_y = y

        if current_line:
            lines.append(sorted(current_line, key=lambda item: item[0][0]))

        # Вывод + сборка
        final_lines = []
        for line in lines:
            for (_, _), text, conf in line:
                print(f"🔍 Найдено: {text} (уверенность: {conf:.2f})")
            final_lines.append(' '.join(text for (_, _), text, _ in line))

        return ' '.join(final_lines)
