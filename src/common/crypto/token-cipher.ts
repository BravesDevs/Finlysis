import * as crypto from 'crypto';

/**
 * Loads and validates the 32-byte AES-256-GCM encryption key from the environment.
 * Accepts either:
 *   - A 64-character lowercase hex string  (most common for generated keys)
 *   - A raw 32-character UTF-8 string
 * Throws immediately if the env var is absent or the resulting key is not 32 bytes,
 * so misconfiguration surfaces at startup rather than at the first API call.
 */
function loadKey(): Buffer {
  const raw = process.env.PLAID_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('PLAID_TOKEN_ENCRYPTION_KEY environment variable is not set');
  }

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'utf8');

  if (key.length !== 32) {
    throw new Error(
      `PLAID_TOKEN_ENCRYPTION_KEY must be exactly 32 bytes. ` +
        `Provide a 64-character hex string or a 32-character UTF-8 string. ` +
        `Received ${key.length} bytes.`,
    );
  }

  return key;
}

/** Call once at application startup to surface key misconfiguration immediately. */
export function validateEncryptionKey(): void {
  loadKey();
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Returns base64-encoded ciphertext, a freshly generated 12-byte IV, and the 16-byte GCM auth tag.
 * The plaintext is never retained after the function returns.
 */
export function encryptToken(plaintext: string): {
  ciphertext: string;
  iv: string;
  tag: string;
} {
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypts a base64 ciphertext produced by encryptToken.
 * Throws if the auth tag does not match (tampered ciphertext).
 * The decrypted value must be handled as a secret by the caller.
 */
export function decryptToken(ciphertext: string, iv: string, tag: string): string {
  const key = loadKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
