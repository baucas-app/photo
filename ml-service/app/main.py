import os

from fastapi import FastAPI, HTTPException, Security
from fastapi.security import APIKeyHeader
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from starlette.status import HTTP_403_FORBIDDEN

from . import clip_service, face_service, yolo_service
from .config import resolve_path

try:
    import pytesseract as _tesseract
    _OCR_AVAILABLE = True
except ImportError:
    _OCR_AVAILABLE = False

app = FastAPI(title="Photos ML Service")

# Internal shared secret — set ML_INTERNAL_KEY in the environment.
# If unset in dev, auth is skipped (backwards compatible).
_INTERNAL_KEY = os.environ.get("ML_INTERNAL_KEY", "")
_key_header = APIKeyHeader(name="X-Internal-Key", auto_error=False)


def _require_internal(key: str | None = Security(_key_header)):
    if _INTERNAL_KEY and key != _INTERNAL_KEY:
        raise HTTPException(status_code=HTTP_403_FORBIDDEN, detail="Forbidden")


class ImagePathRequest(BaseModel):
    path: str


class TextRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed/image", dependencies=[Security(_require_internal)])
def embed_image(body: ImagePathRequest):
    try:
        absolute_path = resolve_path(body.path)
        return {"embedding": clip_service.embed_image(absolute_path)}
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail=f"Unreadable image: {exc}") from exc


@app.post("/embed/text", dependencies=[Security(_require_internal)])
def embed_text(body: TextRequest):
    return {"embedding": clip_service.embed_text(body.text)}


@app.post("/detect/objects", dependencies=[Security(_require_internal)])
def detect_objects(body: ImagePathRequest):
    try:
        absolute_path = resolve_path(body.path)
        return {"objects": yolo_service.detect_objects(absolute_path)}
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail=f"Unreadable image: {exc}") from exc


@app.post("/detect/faces", dependencies=[Security(_require_internal)])
def detect_faces(body: ImagePathRequest):
    try:
        absolute_path = resolve_path(body.path)
        return {"faces": face_service.detect_faces(absolute_path)}
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail=f"Unreadable image: {exc}") from exc


@app.post("/ocr", dependencies=[Security(_require_internal)])
def run_ocr(body: ImagePathRequest):
    if not _OCR_AVAILABLE:
        raise HTTPException(status_code=503, detail="pytesseract not installed; add it via requirements.txt")
    try:
        absolute_path = resolve_path(body.path)
        img = Image.open(absolute_path)
        text: str = _tesseract.image_to_string(img)
        return {"text": text.strip()}
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail=f"Unreadable image: {exc}") from exc
