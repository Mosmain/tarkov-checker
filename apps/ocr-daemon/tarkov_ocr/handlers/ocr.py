import easyocr
from PIL import Image
from typing import Optional, List
import numpy as np

# Создаём один OCR-ридер на всё приложение
reader = easyocr.Reader(['ru', 'en'], gpu=False)

def extract_text(image: Image.Image) -> Optional[str]:
    """
    Распознаёт текст с изображения. Корректирует порядок слов по строкам.
    Возвращает финальную строку.
    """
    result = reader.readtext(np.array(image))

    if not result:
        return None

    # Порог для объединения в одну строку (в пикселях)
    LINE_HEIGHT_THRESHOLD = 10

    # Временный формат: [((x, y), text, confidence)]
    items = [
        ((min(pt[0] for pt in box), min(pt[1] for pt in box)), text, conf)
        for box, text, conf in result
    ]

    # Сортируем по Y
    items.sort(key=lambda x: x[0][1])

    lines = []
    current_line = []
    last_y = None

    for (x, y), text, conf in items:
        if last_y is None or abs(y - last_y) < LINE_HEIGHT_THRESHOLD:
            current_line.append(((x, y), text, conf))
        else:
            # Сортируем текущую строку по X и добавляем
            lines.append(sorted(current_line, key=lambda x: x[0][0]))
            current_line = [((x, y), text, conf)]
        last_y = y

    if current_line:
        lines.append(sorted(current_line, key=lambda x: x[0][0]))

    # Сборка текста
    final_lines = []
    for line in lines:
        for (_, _), text, conf in line:
            print(f"🔍 Найдено: {text} (уверенность: {conf:.2f})")
        final_lines.append(' '.join(text for (_, _), text, _ in line))

    return ' '.join(final_lines)
