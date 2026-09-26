import os

STORAGE_ROOT = os.environ.get("STORAGE_ROOT", "/photos")
CLIP_MODEL_NAME = os.environ.get("CLIP_MODEL_NAME", "openai/clip-vit-base-patch32")
YOLO_MODEL_NAME = os.environ.get("YOLO_MODEL_NAME", "yolov8n.pt")


def resolve_path(relative_path: str) -> str:
    """
    Mirrors the backend's filesystem.service.ts: STORAGE_ROOT is mounted
    read-only here, and every path the backend sends is already relative
    to it (e.g. "/2024/Urlaub/photo1.jpg").
    """
    normalized = os.path.normpath(relative_path).lstrip("./")
    if not normalized.startswith("/"):
        normalized = "/" + normalized
    absolute = os.path.normpath(STORAGE_ROOT + normalized)
    if not absolute.startswith(os.path.abspath(STORAGE_ROOT)):
        raise ValueError("Invalid path")
    return absolute
