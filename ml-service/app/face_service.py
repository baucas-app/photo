import face_recognition
import numpy as np
from PIL import Image, ImageOps


def _load_upright_rgb(absolute_path: str) -> np.ndarray:
    # face_recognition.load_image_file ignores EXIF orientation: rotated phone
    # photos then yield no faces (HOG expects upright faces) and bounding boxes
    # in the wrong coordinate system compared to what the frontend displays.
    with Image.open(absolute_path) as raw:
        image = ImageOps.exif_transpose(raw).convert("RGB")
    return np.array(image)


def detect_faces(absolute_path: str) -> list[dict]:
    image = _load_upright_rgb(absolute_path)
    locations = face_recognition.face_locations(image)
    encodings = face_recognition.face_encodings(image, known_face_locations=locations)

    height, width = image.shape[0], image.shape[1]

    faces = []
    for (top, right, bottom, left), encoding in zip(locations, encodings):
        faces.append(
            {
                # Normalized 0-1 so the backend doesn't need to know the
                # original image dimensions to draw the bounding box later.
                "x": left / width,
                "y": top / height,
                "w": (right - left) / width,
                "h": (bottom - top) / height,
                "confidence": 1.0,  # face_recognition's HOG detector doesn't expose a score
                "embedding": encoding.tolist(),
            }
        )
    return faces
