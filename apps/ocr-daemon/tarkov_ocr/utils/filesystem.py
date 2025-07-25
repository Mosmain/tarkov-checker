import time
from pathlib import Path


def wait_for_file_ready(path: Path, timeout: float = 2.0, check_interval: float = 0.1) -> bool:
    """
    Ожидает, пока файл будет полностью записан и доступен для чтения.

    :param path: Путь до файла.
    :param timeout: Максимальное время ожидания в секундах.
    :param check_interval: Интервал между проверками в секундах.
    :return: True — файл готов к использованию, False — превышен таймаут.
    """
    start_time = time.time()
    last_size = -1

    while time.time() - start_time < timeout:
        try:
            if not path.exists():
                time.sleep(check_interval)
                continue

            current_size = path.stat().st_size
            if current_size > 0 and current_size == last_size:
                # файл стабилен по размеру и доступен для чтения
                with open(path, "rb") as f:
                    f.read(1)
                return True

            last_size = current_size

        except (OSError, IOError):
            pass  # возможно, файл ещё записывается другим процессом

        time.sleep(check_interval)

    print(f"⚠️ Таймаут ожидания готовности файла: {path}")
    return False
