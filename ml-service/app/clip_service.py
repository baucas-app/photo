import threading
from functools import lru_cache

import torch
from PIL import Image, ImageOps
from transformers import CLIPModel, CLIPProcessor

from .config import CLIP_MODEL_NAME

# lru_cache does not stop two threads from running _load() concurrently on a
# cold cache (FastAPI runs sync endpoints in a threadpool), which would load
# the weights twice on a 4GB NAS. The lock makes the first load exclusive.
_load_lock = threading.Lock()


@lru_cache(maxsize=1)
def _load_unlocked():
    # Loaded lazily and cached: the DS1621+ has 4GB RAM, so we only pay for
    # CLIP's weights once the first embedding request actually needs them.
    model = CLIPModel.from_pretrained(CLIP_MODEL_NAME)
    processor = CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)
    model.eval()
    return model, processor


def _load():
    with _load_lock:
        return _load_unlocked()


def embed_image(absolute_path: str) -> list[float]:
    model, processor = _load()
    with Image.open(absolute_path) as raw:
        # Respect EXIF orientation (phone photos) so the model sees the image upright.
        image = ImageOps.exif_transpose(raw).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        features = model.get_image_features(**inputs)
    return features[0].tolist()


def embed_text(text: str) -> list[float]:
    model, processor = _load()
    inputs = processor(text=[text], return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        features = model.get_text_features(**inputs)
    return features[0].tolist()
