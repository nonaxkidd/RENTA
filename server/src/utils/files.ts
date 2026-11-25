import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { decryptBuffer, encryptBuffer } from "./cryptoDocs";

export const PRIVATE_DIR = path.resolve(__dirname, "../../storage/private-docs");
export const LISTING_DIR = path.resolve(__dirname, "../../storage/public-listings");

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
});

export function sniffFile(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export async function saveEncryptedDoc(buffer: Buffer): Promise<string> {
  await fs.promises.mkdir(PRIVATE_DIR, { recursive: true });
  const name = randomBytes(16).toString("hex");
  await fs.promises.writeFile(path.join(PRIVATE_DIR, name), encryptBuffer(buffer));
  return name;
}

export async function readEncryptedDoc(name: string): Promise<Buffer> {
  if (!/^[a-f0-9]{32}$/.test(name)) {
    throw new Error("Invalid file.");
  }
  const stored = await fs.promises.readFile(path.join(PRIVATE_DIR, name));
  return decryptBuffer(stored);
}

export async function saveListingPhoto(buffer: Buffer, mime: "image/jpeg" | "image/png" | "image/webp"): Promise<string> {
  await fs.promises.mkdir(LISTING_DIR, { recursive: true });
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  await fs.promises.writeFile(path.join(LISTING_DIR, name), buffer);
  return name;
}
