const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short random id, e.g. uid() -> 'k3j9x2ma1q', uid('shot') -> 'shot_k3j9x2ma1q' */
export function uid(prefix?: string, length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}
