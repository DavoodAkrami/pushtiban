import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";

// The implementation moved to src/lib/crypto/secret-box.ts once Instagram
// needed the same envelope. These names stay so every existing Telegram call
// site reads the same as before, and so the ciphertext already in
// telegram_connections keeps decrypting unchanged.

export const encryptTelegramToken = (token: string) => encryptSecret(token);

export const decryptTelegramToken = (value: string) => decryptSecret(value);
