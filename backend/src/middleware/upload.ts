import os from "node:os";
import multer from "multer";

const options = {
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB covers 4K video clips from iPhone
  // Browsers/iOS send the multipart filename as raw UTF-8 without a charset
  // parameter; multer's default (latin1) turns "Übung.jpg" into "Ãbung.jpg".
  // (Not in @types/multer yet, hence the non-literal options object.)
  defParamCharset: "utf8",
};

export const upload = multer(options);
