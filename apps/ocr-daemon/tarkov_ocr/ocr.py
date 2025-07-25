import easyocr
from PIL import Image
from typing import Optional, List
import numpy as np

# Создаём один OCR-ридер на всё приложение
reader = easyocr.Reader(['ru', 'en'], gpu=False)

def extract_text(image: Image.Image) -> Optional[List[str]]:
    """
    Распознаёт текст с изображения.
    Возвращает список строк в порядке, в котором EasyOCR их нашёл.
    """
    result = reader.readtext(np.array(image))

    if not result:
        return None

    texts = []
    for _, text, confidence in result:
        print(f"🔍 Найдено: {text} (уверенность: {confidence:.2f})")
        texts.append(text.strip())

    return ' '.join(texts)
