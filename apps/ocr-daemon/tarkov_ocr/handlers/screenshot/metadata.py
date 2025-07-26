from pathlib import Path
import re


class MetadataParser:
    """
    Класс для извлечения метаданных из имени скриншота.
    """

    def parse(self, filename: str) -> dict | None:
        """
        Пример формата имени:
        2025-07-26[08-41]_-175.33, 3.97, 468.55_0.00002, 0.99992, 0.00188, -0.01251_18.80 (0).png
        """
        name = Path(filename).stem
        parts = name.split("_")

        if len(parts) < 4:
            return None

        try:
            datetime_raw = parts[0]
            coords = [round(float(x.strip()), 2) for x in parts[1].split(",")]
            quat = [round(float(x.strip()), 2) for x in parts[2].split(",")]

            match = re.search(r"([-+]?\d*\.\d+|\d+)", parts[3])
            extra = float(match.group(1)) if match else None

            return {
                "datetime": datetime_raw,
                "position": coords,
                "quaternion": quat,
                "extra": extra,
            }
        except Exception as e:
            print(f"[❌ parse error] {filename}: {e}")
            return None
