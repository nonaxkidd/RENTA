import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const PREFIX = "enc:v1:";

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const dedicated = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === "production") {
    if (!dedicated) {
      throw new Error("DOCUMENT_ENCRYPTION_KEY is required in production.");
    }
    cachedKey = scryptSync(dedicated, "renta-document-v1", 32);
    return cachedKey;
  }

  const secret = dedicated || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("DOCUMENT_ENCRYPTION_KEY or JWT_SECRET is required to protect documents.");
  }

  cachedKey = scryptSync(secret, "renta-document-v1", 32);
  return cachedKey;
}

export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptBuffer(stored: Buffer): Buffer {
  if (stored.length < 29) {
    throw new Error("Stored document could not be read.");
  }
  const iv = stored.subarray(0, 12);
  const tag = stored.subarray(12, 28);
  const data = stored.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** Encrypt a document link before it is stored. Existing plaintext values are left unchanged. */
export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Decrypt a stored document link. Values saved before encryption still pass through. */
export function decryptText(stored?: string | null): string | undefined {
  if (!stored) return undefined;
  if (!stored.startsWith(PREFIX)) return stored;

  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Stored document could not be read.");
  }

  const [ivPart, tagPart, dataPart] = parts;
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Stored document could not be read.");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]);
  return plain.toString("utf8");
}
