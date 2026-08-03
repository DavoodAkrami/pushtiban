import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for third-party credentials at rest. Every channel that stores a
// token for a business (Telegram bot tokens, Instagram access tokens) uses this
// one implementation, so the ciphertext format and key handling stay identical
// across them.
//
// Format: v1:<iv base64>:<auth tag base64>:<ciphertext base64>

const encryptionKey = () => {
  // SECRET_ENCRYPTION_KEY is the name to use going forward; the Telegram-era
  // name is still honoured so existing deployments keep decrypting the tokens
  // they already stored.
  const encoded =
    process.env.SECRET_ENCRYPTION_KEY ??
    process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Secret encryption is not configured.");

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("Secret encryption key must be 32 bytes.");
  }
  return key;
};

export const encryptSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
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

export const decryptSecret = (value: string) => {
  const [version, ivValue, tagValue, ciphertextValue, extra] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue || extra) {
    throw new Error("Secret ciphertext is invalid.");
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
