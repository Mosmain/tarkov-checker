from tarkov_ocr.core import fuzz
from tarkov_ocr.handlers.screenshot.ocr import OCRContext
from numpy import ndarray
from typing import Optional, Tuple, Dict, List


class ItemIdentifier:
    def __init__(self, items: List[str]):
        self.ocr = OCRContext()
        self.normalized_map: Dict[str, str] = fuzz.prepare_normalized_map(items)

    def identify(self, image: ndarray) -> Optional[Tuple[str, float]]:
        text = self.ocr.extract_text(image)
        if not text or not text.strip():
            return None

        match = fuzz.best_match(text, self.normalized_map)
        if not match:
            return None

        name, score = match
        try:
            return name, float(score)
        except (ValueError, TypeError):
            return None
