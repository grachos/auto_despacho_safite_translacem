/**
 * Cifrado AES-256-GCM para almacenar de forma segura las credenciales de Safite en MySQL
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY || 'default_secret_key_32_bytes_length!!';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Cifra un texto plano
 */
export function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  // iv:tag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Descifra un texto previamente cifrado
 */
export function decrypt(encryptedData) {
  if (!encryptedData) return '';
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de datos cifrados inválido.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
