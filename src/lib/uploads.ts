import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "./password";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

function uploadDir() {
  return path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
}

export async function saveUpload(file: File): Promise<{ storedName: string; size: number; mimeType: string }> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) throw new Error("Only JPG, PNG, WEBP or PDF files are allowed.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 5 MB.");
  const storedName = `${randomToken(16)}${ext}`;
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), storedName), Buffer.from(await file.arrayBuffer()));
  return { storedName, size: file.size, mimeType: file.type };
}

export async function readUpload(storedName: string): Promise<Buffer> {
  return readFile(path.join(uploadDir(), path.basename(storedName)));
}

export async function deleteUpload(storedName: string): Promise<void> {
  await unlink(path.join(uploadDir(), path.basename(storedName))).catch(() => undefined);
}
