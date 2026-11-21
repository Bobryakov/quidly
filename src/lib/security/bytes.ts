// Мелкие помощники: перевод байтов в текст и обратно (base64) и сравнение без утечки по времени.

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** base64url — вариант base64 для адресов и WebAuthn (без +, / и =). */
export function toB64Url(bytes: ArrayBuffer | Uint8Array): string {
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return fromB64(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** Сравнение одинаковой длительности — чтобы по времени ответа нельзя было угадывать. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function sha256(data: Uint8Array<ArrayBuffer> | string): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
