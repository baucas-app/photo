import pillow_heif

# Must run before anything in this package calls PIL.Image.open() - iPhones
# shoot HEIC by default, and plain Pillow can't read it at all without this.
# Registering here (not per-module) guarantees it happens exactly once,
# regardless of which submodule (clip_service, face_service, main, ...) is
# imported first.
pillow_heif.register_heif_opener()
