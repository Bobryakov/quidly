import { describe, expect, it } from 'vitest'
import { derToRaw, rawToDer, verifyAssertion, type AssertionParts, type BiometricRecord } from './biometric'
import { fromB64Url, randomBytes, sha256, toB64, toB64Url } from './bytes'

const ORIGIN = 'https://bobryakov.github.io'

/** Делаем «телефон» в тесте: пара ключей, подписываем так же, как это делает настоящий телефон. */
async function fakePhone() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const spki = await crypto.subtle.exportKey('spki', keys.publicKey)
  const record: BiometricRecord = { credentialId: toB64Url(randomBytes(16)), publicKey: toB64(spki), alg: -7 }

  const assert = async (
    challenge: Uint8Array,
    o: { origin?: string; type?: string; flags?: number; otherChallenge?: boolean } = {},
  ): Promise<AssertionParts> => {
    const client = {
      type: o.type ?? 'webauthn.get',
      challenge: toB64Url(o.otherChallenge ? randomBytes(32) : challenge),
      origin: o.origin ?? ORIGIN,
    }
    const clientDataJSON = new TextEncoder().encode(JSON.stringify(client))
    const authenticatorData = new Uint8Array(37)
    authenticatorData.set(await sha256('bobryakov.github.io'), 0)
    authenticatorData[32] = o.flags ?? 0x05 // человек рядом + личность подтверждена
    const signed = new Uint8Array([...authenticatorData, ...(await sha256(clientDataJSON))])
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, signed))
    return { challenge, origin: ORIGIN, clientDataJSON, authenticatorData, signature: rawToDer(raw) }
  }
  return { record, assert }
}

describe('вход по отпечатку: проверка подписи телефона', () => {
  it('настоящая подпись на наш запрос — проходит', async () => {
    const phone = await fakePhone()
    const ch = randomBytes(32)
    expect(await verifyAssertion(phone.record, await phone.assert(ch))).toBe(true)
  })

  it('подпись другим ключом — не проходит', async () => {
    const phone = await fakePhone()
    const other = await fakePhone()
    const ch = randomBytes(32)
    expect(await verifyAssertion(phone.record, await other.assert(ch))).toBe(false)
  })

  it('ответ на чужой запрос, с чужого сайта или без отпечатка — не проходит', async () => {
    const phone = await fakePhone()
    const ch = randomBytes(32)
    expect(await verifyAssertion(phone.record, await phone.assert(ch, { otherChallenge: true }))).toBe(false)
    expect(await verifyAssertion(phone.record, await phone.assert(ch, { origin: 'https://evil.example' }))).toBe(false)
    expect(await verifyAssertion(phone.record, await phone.assert(ch, { type: 'webauthn.create' }))).toBe(false)
    expect(await verifyAssertion(phone.record, await phone.assert(ch, { flags: 0x01 }))).toBe(false)
  })

  it('испорченная подпись или данные — не проходит', async () => {
    const phone = await fakePhone()
    const ch = randomBytes(32)
    const a = await phone.assert(ch)
    const bad = { ...a, authenticatorData: a.authenticatorData.slice() }
    bad.authenticatorData[0] ^= 1
    expect(await verifyAssertion(phone.record, bad)).toBe(false)
    expect(await verifyAssertion(phone.record, { ...a, signature: new Uint8Array([1, 2, 3]) })).toBe(false)
    expect(await verifyAssertion(phone.record, { ...a, clientDataJSON: new TextEncoder().encode('{') })).toBe(false)
  })

  it('формат подписи DER ↔ «r и s подряд» переводится туда и обратно', () => {
    for (let i = 0; i < 50; i++) {
      const raw = randomBytes(64)
      if (i % 5 === 0) raw[0] = 0 // короткое r
      if (i % 7 === 0) raw[32] = 0x80 // s со старшим битом
      expect(Array.from(derToRaw(rawToDer(raw)))).toEqual(Array.from(raw))
    }
    expect(() => derToRaw(new Uint8Array([1, 2]))).toThrow()
  })

  it('base64url туда и обратно', () => {
    const b = randomBytes(33)
    expect(Array.from(fromB64Url(toB64Url(b)))).toEqual(Array.from(b))
    expect(toB64Url(new Uint8Array([251, 255]))).toBe('-_8')
  })
})
