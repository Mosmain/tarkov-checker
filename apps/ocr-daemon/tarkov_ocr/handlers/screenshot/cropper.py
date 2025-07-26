import pyautogui
from pathlib import Path
from PIL import Image
import numpy as np
import cv2

from tarkov_ocr.core import config


class CropContext:
    """
    Контекст обрезки изображения вокруг курсора с последующей OpenCV-фильтрацией.
    """

    def crop_around_cursor(self, image_path: Path, cursor_x: int, cursor_y: int) -> Image.Image:
        screen_width, _ = pyautogui.size()
        crop_w, crop_h = config.CROP_WIDTH, config.CROP_HEIGHT

        with Image.open(image_path) as img:
            img_w, img_h = img.size

            left = max(cursor_x + 13, 0)
            top = max(cursor_y - 62, 0)

            if (screen_width - cursor_x) < crop_w:
                left = screen_width - crop_w

            right = min(left + crop_w, img_w)
            bottom = min(top + crop_h, img_h)

            cropped = img.crop((left, top, right, bottom)).convert("RGB")

            # OpenCV: обработка контуров
            cv_img = cv2.cvtColor(np.array(cropped), cv2.COLOR_RGB2BGR)
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
            _, thresh = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY_INV)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            refined_crop = None
            for c in contours:
                if cv2.contourArea(c) < 1000:
                    continue
                approx = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
                if len(approx) != 4:
                    continue
                x, y, w, h = cv2.boundingRect(approx)
                refined_crop = cv_img[y:y + h, x:x + w]
                break

            if refined_crop is not None:
                return Image.fromarray(cv2.cvtColor(refined_crop, cv2.COLOR_BGR2RGB)).copy()

            return cropped.copy()
