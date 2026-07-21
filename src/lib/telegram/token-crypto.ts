import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const encryptionKey = () => {
  const encoded = process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Telegram token encryption is not configured.");

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("Telegram token encryption key must be 32 bytes.");
  }
  return key;
};

export const encryptTelegramToken = (token: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
};

export const decryptTelegramToken = (value: string) => {
  const [version, ivValue, tagValue, ciphertextValue, extra] = value.split(":");
  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra
  ) {
    throw new Error("Telegram token ciphertext is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
};
