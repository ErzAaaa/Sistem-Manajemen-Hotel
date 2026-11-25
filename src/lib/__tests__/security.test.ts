import { describe, it, expect } from 'vitest'
import { encryptText, decryptText } from '../crypto'
import { maskIdentitas } from '../format'
import { hasPermission } from '../auth'

describe('crypto & masking', () => {
  it('encrypts and decrypts NIK/Passport round-trip', () => {
    const nik = '3171012345678901'
    const encrypted = encryptText(nik)
    expect(encrypted).not.toBe(nik)
    expect(encrypted.split(':')).toHaveLength(3)
    expect(decryptText(encrypted)).toBe(nik)
  })

  it('masks identity numbers leaving only last 4 chars', () => {
    expect(maskIdentitas('3171012345678901')).toBe('****8901')
    expect(maskIdentitas('12')).toBe('****')
  })
})

describe('RBAC permissions', () => {
  it('allows OWNER everything, restricts RESEPSIONIS from profit reports', () => {
    expect(hasPermission('OWNER', 'laporan.laba')).toBe(true)
    expect(hasPermission('MANAJER', 'tutup-hari.reopen')).toBe(true)
    expect(hasPermission('RESEPSIONIS', 'reservasi.write')).toBe(true)
    expect(hasPermission('RESEPSIONIS', 'laporan.laba')).toBe(false)
    expect(hasPermission('ADMIN_KEUANGAN', 'pengeluaran.write')).toBe(true)
    expect(hasPermission('ADMIN_KEUANGAN', 'tutup-hari.reopen')).toBe(false)
  })
})
