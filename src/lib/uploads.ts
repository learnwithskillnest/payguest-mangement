import "server-only";
import { randomToken } from "./password";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

/** Validate an uploaded file and return the fields to store on a Document row. */
export async function readUploadedFile(file: File) {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error("Only JPG, PNG, WEBP or PDF files are allowed.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 5 MB.");
  return {
    storedName: `${randomToken(16)}${ext}`,
    size: file.size,
    mimeType: file.type,
    data: new Uint8Array(await file.arrayBuffer()),
  };
}
