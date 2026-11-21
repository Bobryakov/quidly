import { equalBytes, fromB64, fromB64Url, randomBytes, sha256, toB64, toB64Url } from './bytes'

/**
 * Вход по отпечатку или лицу — через WebAuthn (встроенный в браузер способ «подтвердить, что это владелец»).
 * Телефон хранит секретный ключ у себя и выпускает его только после отпечатка/лица.
 * Мы храним открытую половину ключа и проверяем подпись телефона — без всяких серверов.
 */

export interface BiometricRecord {
  /** id ключа, base64url */
  credentialId: string
  /** открытый ключ (SPKI), base64 */
  publicKey: string
  /** -7 = ES256 (эллиптические кривые), -257 = RS256 (RSA) */
  alg: number
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (
      typeof window !== 'undefined' &&
      !!window.PublicKeyCredential &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    )
  } catch {
    return false
  }
}

export async function registerBiometric(): Promise<BiometricRecord> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Quidly' },
      user: { id: randomBytes(16), name: 'Quidly', displayName: 'Quidly' },
      challenge: randomBytes(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Не удалось подключить отпечаток')
  const resp = cred.response as AuthenticatorAttestationResponse
  const pk = resp.getPublicKey?.()
  const alg = resp.getPublicKeyAlgorithm?.()
  if (!pk || (alg !== -7 && alg !== -257)) throw new Error('Этот телефон не поддерживает вход по отпечатку в браузере')
  return { credentialId: toB64Url(cred.rawId), publicKey: toB64(pk), alg }
}

/** Попросить отпечаток/лицо и проверить подпись. true — это владелец. */
export async function verifyBiometric(record: BiometricRecord): Promise<boolean> {
  const challenge = randomBytes(32)
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: fromB64Url(record.credentialId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) return false
  const r = cred.response as AuthenticatorAssertionResponse
  return verifyAssertion(record, {
    challenge,
    origin: location.origin,
    clientDataJSON: new Uint8Array(r.clientDataJSON),
    authenticatorData: new Uint8Array(r.authenticatorData),
    signature: new Uint8Array(r.signature),
  })
}

export interface AssertionParts {
  challenge: Uint8Array
  origin: string
  clientDataJSON: Uint8Array<ArrayBuffer>
  authenticatorData: Uint8Array<ArrayBuffer>
  signature: Uint8Array<ArrayBuffer>
}

/** Проверка ответа телефона: тот ли запрос, наш ли сайт, был ли отпечаток, верна ли подпись. */
export async function verifyAssertion(record: BiometricRecord, a: AssertionParts): Promise<boolean> {
  let client: { type?: string; challenge?: string; origin?: string }
  try {
    client = JSON.parse(new TextDecoder().decode(a.clientDataJSON))
  } catch {
    return false
  }
  if (client.type !== 'webauthn.get') return false
  if (!client.challenge || !equalBytes(fromB64Url(client.challenge), a.challenge)) return false
  if (client.origin !== a.origin) return false
  // Флаги: бит 0 — человек был рядом, бит 2 — личность подтверждена (отпечаток/лицо/код телефона)
  const flags = a.authenticatorData[32]
  if (flags === undefined || (flags & 0x01) === 0 || (flags & 0x04) === 0) return false

  const signed = concat(a.authenticatorData, await sha256(a.clientDataJSON))
  try {
    if (record.alg === -7) {
      const key = await crypto.subtle.importKey('spki', fromB64(record.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(a.signature), signed)
    }
    const key = await crypto.subtle.importKey('spki', fromB64(record.publicKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, a.signature, signed)
  } catch {
    return false
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/**
 * Телефон отдаёт подпись ES256 в формате DER (SEQUENCE из двух чисел r и s),
 * а браузерная проверка ждёт «r и s подряд по 32 байта». Переводим.
 */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error('not DER')
  let i = 2
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f)
  const out = new Uint8Array(64)
  for (const offset of [0, 32]) {
    if (der[i] !== 0x02) throw new Error('not DER')
    const len = der[i + 1]
    let int = der.subarray(i + 2, i + 2 + len)
    while (int.length > 32 && int[0] === 0) int = int.subarray(1)
    if (int.length > 32) throw new Error('not DER')
    out.set(int, offset + 32 - int.length)
    i += 2 + len
  }
  return out
}

/** Обратное преобразование — нужно только тестам (чтобы подписать «как телефон»). */
export function rawToDer(raw: Uint8Array): Uint8Array<ArrayBuffer> {
  const int = (b: Uint8Array) => {
    let x = b
    while (x.length > 1 && x[0] === 0 && !(x[1] & 0x80)) x = x.subarray(1)
    if (x[0] & 0x80) x = concat(new Uint8Array([0]), x)
    return concat(new Uint8Array([0x02, x.length]), x)
  }
  const body = concat(int(raw.subarray(0, 32)), int(raw.subarray(32)))
  return concat(new Uint8Array([0x30, body.length]), body)
}
