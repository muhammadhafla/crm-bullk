import crypto from 'crypto';

/**
 * Encryption utilities for sensitive data like Evolution API keys
 * Uses AES-256-GCM encryption with a master key from environment variables
 */

const ALGO = 'aes-256-gcm';
const MASTER_KEY = process.env.MASTER_KEY || process.env.JWT_SECRET;

/**
 * Validate if master key is available and properly formatted
 */
function validateMasterKey(): void {
  if (!MASTER_KEY) {
    throw new Error('MASTER_KEY or JWT_SECRET environment variable is required');
  }
  
  // Convert to 32 bytes buffer (required for AES-256)
  const keyBuffer = Buffer.from(MASTER_KEY, 'utf8');
  if (keyBuffer.length !== 32) {
    throw new Error(`MASTER_KEY must be exactly 32 bytes for AES-256. Current length: ${keyBuffer.length} bytes`);
  }
}

/**
 * Encrypt sensitive text using AES-256-GCM
 * @param text - The text to encrypt
 * @returns Encrypted string in format: iv:tag:ciphertext (all hex encoded)
 */
export function encrypt(text: string): string {
  try {
    validateMasterKey();
    
    const keyBuffer = Buffer.from(MASTER_KEY!, 'utf8');
    const iv = crypto.randomBytes(12); // 12 bytes IV for GCM
    const cipher = crypto.createCipheriv(ALGO, keyBuffer, iv);
    
    // Encrypt the text
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    // Return in format: iv:tag:ciphertext (hex encoded)
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt encrypted text using AES-256-GCM
 * @param encryptedStr - Encrypted string in format: iv:tag:ciphertext (hex encoded)
 * @returns Decrypted plain text
 */
export function decrypt(encryptedStr: string): string {
  try {
    validateMasterKey();
    
    // Parse the encrypted string
    const [ivHex, tagHex, encHex] = encryptedStr.split(':');
    if (!ivHex || !tagHex || !encHex) {
      throw new Error('Invalid encrypted string format');
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    
    const keyBuffer = Buffer.from(MASTER_KEY!, 'utf8');
    const decipher = crypto.createDecipheriv(ALGO, keyBuffer, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt the text
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Encrypt Evolution API credentials safely
 * @param url - Evolution API URL
 * @param apiKey - Evolution API Key
 * @param instanceName - Instance name
 * @returns Object with encrypted credentials
 */
export function encryptEvolutionCredentials(url: string, apiKey: string, instanceName: string) {
  return {
    evolutionUrl: url,
    evolutionApiKey: encrypt(apiKey),
    instanceName: instanceName
  };
}

/**
 * Decrypt Evolution API credentials safely
 * @param evolutionApiKey - Encrypted API key
 * @returns Decrypted API key
 */
export function decryptEvolutionApiKey(evolutionApiKey?: string | null): string | null {
  if (!evolutionApiKey) return null;
  
  try {
    return decrypt(evolutionApiKey);
  } catch (error) {
    throw new Error(`Failed to decrypt Evolution API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Hash a refresh token for secure storage
 * @param token - The raw refresh token
 * @returns SHA-256 hash of the token
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Generate a secure random refresh token
 * @returns 64-byte hex string
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Generate a random ID for external tracking
 * @returns 16-byte hex string
 */
export function generateRandomId(): string {
  return crypto.randomBytes(16).toString('hex');
}