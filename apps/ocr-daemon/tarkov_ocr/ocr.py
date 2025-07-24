import easyocr
from PIL import Image
from typing import Optional
import numpy as np

# Создаём один OCR-ридер на всё приложение
reader = easyocr.Reader(['ru', 'en'], gpu=False)

def extract_text(image: Image.Image) -> Optional[str]:
    """
    Распознаёт текст с изображения.
    Возвращает наиболее вероятную строку (по уверенности).
    """
    # EasyOCR принимает путь или numpy-массив, PIL можно конвертнуть
    result = reader.readtext(np.array(image))

    if not result:
        return None

    for r in result:
      print(f"🔍 Найдено: {r[1]} (уверенность: {r[2]:.2f})")

    # Сортируем по уверенности и берём лучшую строку
    result.sort(key=lambda r: r[2], reverse=True)  # r = (bbox, text, confidence)
    return result[0][1].strip()
