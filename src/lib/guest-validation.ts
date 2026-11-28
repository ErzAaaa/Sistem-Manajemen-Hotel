export const MAX_GUEST_ADDRESS_LENGTH = 200

export type GuestAddressValidationResult =
  | { valid: true; value: string | null }
  | { valid: false; error: string }

export interface ValidateGuestAddressOptions {
  required?: boolean
}

/**
 * Validates guest address ("Alamat"):
 * - Nullable for existing/optional records; required for new check-ins when options.required is true.
 * - Single free-text line (no CR/LF), max 200 characters after trimming.
 */
export function validateGuestAddress(
  raw: unknown,
  options?: ValidateGuestAddressOptions
): GuestAddressValidationResult {
  const required = Boolean(options?.required)

  if (raw === undefined || raw === null) {
    if (required) {
      return { valid: false, error: 'Alamat tamu wajib diisi untuk check-in.' }
    }
    return { valid: true, value: null }
  }

  if (typeof raw !== 'string') {
    return { valid: false, error: 'Format alamat tamu tidak valid.' }
  }

  if (/[\r\n]/.test(raw)) {
    return { valid: false, error: 'Alamat tamu harus berupa satu baris teks.' }
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    if (required) {
      return { valid: false, error: 'Alamat tamu wajib diisi untuk check-in.' }
    }
    return { valid: true, value: null }
  }

  if (trimmed.length > MAX_GUEST_ADDRESS_LENGTH) {
    return {
      valid: false,
      error: `Alamat tamu maksimal ${MAX_GUEST_ADDRESS_LENGTH} karakter.`,
    }
  }

  return { valid: true, value: trimmed }
}

/**
 * Formats guest address for display, exports, and receipts ("-" when null or blank).
 */
export function formatGuestAddress(alamat: string | null | undefined): string {
  if (!alamat) return '-'
  const trimmed = alamat.trim()
  return trimmed || '-'
}
