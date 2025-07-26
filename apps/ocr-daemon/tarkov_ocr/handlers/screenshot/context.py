from typing import Sequence
from pathlib import Path

from tarkov_ocr.core import fuzz
from .cropper import CropContext
from .metadata import MetadataParser
from .ocr import OCRContext
from .mouse import MouseContext


class ScreenshotContext:
    def __init__(self, item_names: Sequence[str]) -> None:
        self.normalized_items = fuzz.prepare_normalized_map(item_names)
        self.ocr = OCRContext()
        self.mouse = MouseContext()
        self.metadata = MetadataParser()
        self.cropper = CropContext()

    def parse_metadata(self, filename: str) -> dict | None:
        return self.metadata.parse(filename)

    def crop(self, path: Path, x: int, y: int):
        return self.cropper.crop_around_cursor(path, x, y)

    def recognize(self, image) -> str | None:
        return self.ocr.extract_text(image)

    def get_cursor(self) -> tuple[int, int]:
        return self.mouse.get_position()
