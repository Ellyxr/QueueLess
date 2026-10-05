import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const VENDOR_TERMS_VERSION = 'student-vendor-v1';
export const CONTRACT_WINDOW_MS = 7 * 86_400_000;
export function requireTransition(status: string, allowed: string[]) {
  if (!allowed.includes(status)) throw new ConflictException('Application is not eligible for this action');
}
export function contractIsOverdue(status: string, due: Date | null, now = new Date()) {
  return ['AWAITING_CONTRACT', 'CONTRACT_REJECTED'].includes(status) && !!due && due <= now;
}
export function subscriptionEnd(start: Date, days: number, months?: number | null) {
  if (!months) return new Date(start.getTime() + days * 86_400_000);
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end;
}
function encryptionKey() {
  const encoded = process.env.VENDOR_APPLICATION_ENCRYPTION_KEY ?? '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
    throw new ServiceUnavailableException('Vendor application encryption is not configured');
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new ServiceUnavailableException('Invalid vendor application encryption key');
  return key;
}
export function encryptBankDetails(id: string, accountNumber: string, holderName: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(id));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ accountNumber, holderName }), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
export function decryptBankDetails(id: string, value: string): { accountNumber: string; holderName: string } {
  const [version, iv, tag, data] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new ServiceUnavailableException('Bank details cannot be read');
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
  } catch {
    throw new ServiceUnavailableException('Bank details cannot be read');
  }
}
export type ApplicationUpload = { buffer: Buffer; mimetype: string; size: number };
export function documentExtension(file?: ApplicationUpload) {
  if (!file?.buffer || file.size < 1 || file.size > 5 * 1024 * 1024 || file.size !== file.buffer.length) {
    throw new BadRequestException('An image up to 5 MB is required');
  }
  if (file.mimetype === 'image/jpeg' && file.buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'jpg';
  if (file.mimetype === 'image/png' && file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  throw new BadRequestException('Only JPEG and PNG images with matching file signatures are accepted');
}
