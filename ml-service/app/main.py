from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from . import clip_service, face_service, yolo_service
from .config import resolve_path

app = FastAPI(title="Photos ML Service")


class ImagePathRequest(BaseModel):
    path: str


class TextRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed/image")
def embed_image(body: ImagePathRequest):
    try:
        absolute_path = resolve_path(body.path)
        return {"embedding": clip_service.embed_image(absolute_path)}
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/embed/text")
def embed_text(body: TextRequest):
    return {"embedding": clip_service.embed_text(body.text)}


@app.post("/detect/objects")
def detect_objects(body: ImagePathRequest):
    try:
        absolute_path = resolve_path(body.path)
        return {"objects": yolo_service.detect_objects(absolute_path)}
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/detect/faces")
def detect_faces(body: ImagePathRequest):
    try:
        absolute_path = resolve_path(body.path)
        return {"faces": face_service.detect_faces(absolute_path)}
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
