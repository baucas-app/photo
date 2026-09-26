from functools import lru_cache

from ultralytics import YOLO

from .config import YOLO_MODEL_NAME


@lru_cache(maxsize=1)
def _load() -> YOLO:
    # yolov8n (nano) keeps inference cheap enough for a 4-core NAS; swap
    # YOLO_MODEL_NAME for a bigger variant if accuracy matters more than RAM.
    return YOLO(YOLO_MODEL_NAME)


def detect_objects(absolute_path: str) -> list[dict]:
    model = _load()
    results = model(absolute_path, verbose=False)[0]

    objects = []
    for box in results.boxes:
        label = results.names[int(box.cls[0])]
        confidence = float(box.conf[0])
        objects.append({"label": label, "confidence": confidence})
    return objects
