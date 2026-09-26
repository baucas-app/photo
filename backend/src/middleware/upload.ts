import os from "node:os";
import multer from "multer";

export const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB covers 4K video clips from iPhone
});
