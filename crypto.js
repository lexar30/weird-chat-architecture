/*
 * Cryptographic helper functions for the web chat.  These routines use the
 * browser's Web Crypto API to derive a symmetric key from a password using
 * PBKDF2 and to perform authenticated encryption/decryption with AES‑GCM.
 *
 * Derivation parameters are fixed according to the technical specification:
 *  - Salt: "ghpages-chat-v1"
 *  - Iterations: 100 000
 *  - Hash: SHA‑256
 *  - Key length: 256 bits
 *
 * Encryption uses a random 12‑byte nonce for each message.  The nonce is
 * concatenated with the ciphertext and the result is Base64‑encoded before
 * being written to the sheet.  Decryption performs the reverse operation.
 */

/* Derive a CryptoKey from the supplied seed string. */
async function deriveKey(seed) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(seed),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('ghpages-chat-v1'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return key;
}

/* Convert an ArrayBuffer into a standard Base64 string. */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/* Convert a Base64 string into an ArrayBuffer. */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/* Base64URL‑encode a string.  This helper replaces characters not valid in
 * URL contexts and strips any padding characters.  When encoding binary
 * data, first call arrayBufferToBase64() and then apply this function. */
function base64urlEncode(str) {
  return str
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/* Encrypt a message payload with the derived key.  Returns a Base64 string
 * containing the concatenated nonce and ciphertext. */
async function encryptPayload(payload, key) {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = enc.encode(JSON.stringify(payload));
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    plaintext
  );
  // Concatenate nonce and ciphertext into a single ArrayBuffer
  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);
  return arrayBufferToBase64(combined.buffer);
}

/* Decrypt a Base64 string produced by encryptPayload().  Returns the parsed
 * message object or null if decryption fails. */
async function decryptPayload(ciphertextBase64, key) {
  try {
    const data = base64ToArrayBuffer(ciphertextBase64);
    const iv = data.slice(0, 12);
    const cipher = data.slice(12);
    const plainBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      cipher
    );
    const dec = new TextDecoder();
    const jsonString = dec.decode(plainBuffer);
    return JSON.parse(jsonString);
  } catch (err) {
    console.error('Decryption failed', err);
    return null;
  }
}