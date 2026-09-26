from functools import lru_cache

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

from .config import CLIP_MODEL_NAME


@lru_cache(maxsize=1)
def _load():
    # Loaded lazily and cached: the DS1621+ has 4GB RAM, so we only pay for
    # CLIP's weights once the first embedding request actually needs them.
    model = CLIPModel.from_pretrained(CLIP_MODEL_NAME)
    processor = CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)
    model.eval()
    return model, processor


def embed_image(absolute_path: str) -> list[float]:
    model, processor = _load()
    image = Image.open(absolute_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        features = model.get_image_features(**inputs)
    return features[0].tolist()


def embed_text(text: str) -> list[float]:
    model, processor = _load()
    inputs = processor(text=[text], return_tensors="pt", padding=True)
    with torch.no_grad():
        features = model.get_text_features(**inputs)
    return features[0].tolist()
