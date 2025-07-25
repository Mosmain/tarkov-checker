from rapidfuzz import process, fuzz
from typing import List, Tuple, Optional, Dict
import re

def normalize_text(text: str) -> str:
    """
    Приводит текст к нижнему регистру, сохраняет важные символы:
    - латиница и кириллица
    - цифры
    - дефис, слэш, кавычки
    - пробелы
    """
    text = text.lower()
    text = re.sub(r"[^\w\s/\-\"ёЁ]", "", text)  # убираем всё лишнее, но оставляем нужные знаки
    return " ".join(text.split())  # нормализуем пробелы

def prepare_normalized_map(item_names: List[str]) -> Dict[str, str]:
    """
    Создаёт отображение нормализованного текста → оригинального.
    """
    return {normalize_text(name): name for name in item_names}

def match_item(
    ocr_text: str,
    normalized_items: Dict[str, str],
    limit: int = 3,
    score_cutoff: int = 60
) -> List[Tuple[str, float]]:
    """
    Ищет до `limit` похожих предметов по нормализованному OCR-тексту.
    Возвращает список (оригинальное имя, % совпадения)
    """
    cleaned_text = normalize_text(ocr_text)

    matches = process.extract(
        cleaned_text,
        normalized_items.keys(),
        scorer=fuzz.token_sort_ratio,
        limit=limit,
        score_cutoff=score_cutoff
    )

    return [(normalized_items[key], score) for key, score, _ in matches]

def best_match(
    ocr_text: str,
    normalized_items: Dict[str, str],
    score_cutoff: int = 60
) -> Optional[Tuple[str, float]]:
    """
    Возвращает лучший матч (оригинальное имя, % совпадения),
    либо None, если не найдено.
    """
    cleaned_text = normalize_text(ocr_text)

    match = process.extractOne(
        cleaned_text,
        normalized_items.keys(),
        scorer=fuzz.token_sort_ratio,
        score_cutoff=score_cutoff
    )

    if match:
        key, score, _ = match
        return normalized_items[key], score
    return None
