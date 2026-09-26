import face_recognition


def detect_faces(absolute_path: str) -> list[dict]:
    image = face_recognition.load_image_file(absolute_path)
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
