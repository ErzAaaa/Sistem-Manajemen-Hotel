import { describe, it, expect } from 'vitest'
import {
  MAX_GUEST_ADDRESS_LENGTH,
  validateGuestAddress,
  formatGuestAddress,
} from '../guest-validation'

describe('validateGuestAddress', () => {
  it('returns null when optional address is empty, whitespace, null, or undefined', () => {
    expect(validateGuestAddress(undefined)).toEqual({ valid: true, value: null })
    expect(validateGuestAddress(null)).toEqual({ valid: true, value: null })
    expect(validateGuestAddress('')).toEqual({ valid: true, value: null })
    expect(validateGuestAddress('   ')).toEqual({ valid: true, value: null })
  })

  it('rejects empty or null address when required is true (new check-ins)', () => {
    const fromEmpty = validateGuestAddress('   ', { required: true })
    const fromNull = validateGuestAddress(null, { required: true })

    expect(fromEmpty.valid).toBe(false)
    expect(fromNull.valid).toBe(false)
    if (!fromEmpty.valid) {
      expect(fromEmpty.error).toContain('Alamat')
    }
  })

  it('trims and accepts a single-line address up to 200 characters', () => {
    const exact200 = 'J'.repeat(200)
    expect(validateGuestAddress('  Jl. Pahlawan No. 10, Madiun  ', { required: true })).toEqual({
      valid: true,
      value: 'Jl. Pahlawan No. 10, Madiun',
    })
    expect(validateGuestAddress(exact200, { required: true })).toEqual({
      valid: true,
      value: exact200,
    })
  })

  it('rejects addresses exceeding 200 characters', () => {
    const over200 = 'A'.repeat(MAX_GUEST_ADDRESS_LENGTH + 1)
    const res = validateGuestAddress(over200, { required: true })

    expect(res.valid).toBe(false)
    if (!res.valid) {
      expect(res.error).toContain('200')
    }
  })

  it('rejects multi-line addresses containing LF or CRLF', () => {
    const withLf = validateGuestAddress('Jl. Merdeka 1\nKota Madiun', { required: true })
    const withCrLf = validateGuestAddress('Jl. Merdeka 1\r\nKota Madiun')

    expect(withLf.valid).toBe(false)
    expect(withCrLf.valid).toBe(false)
  })

  it('rejects non-string non-null values', () => {
    const res = validateGuestAddress(12345 as unknown)
    expect(res.valid).toBe(false)
  })
})

describe('formatGuestAddress', () => {
  it('displays "-" for null, undefined, or blank strings (legacy rows)', () => {
    expect(formatGuestAddress(null)).toBe('-')
    expect(formatGuestAddress(undefined)).toBe('-')
    expect(formatGuestAddress('')).toBe('-')
    expect(formatGuestAddress('   ')).toBe('-')
  })

  it('returns trimmed address when present', () => {
    expect(formatGuestAddress('  Jl. Cokroaminoto No. 5, Madiun ')).toBe(
      'Jl. Cokroaminoto No. 5, Madiun'
    )
  })
})
