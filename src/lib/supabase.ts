
/**
 * Supabase Client Helper
 * Sistem Manajemen Hotel — Fase 1
 *
 * Database: Supabase PostgreSQL (via Prisma)
 * Auth: Custom JWT (bcrypt + jsonwebtoken)
 * Supabase client digunakan untuk:
 *   - Storage (upload foto nota)
 *   - Realtime subscriptions (opsional)
 *   - Direct table / RPC access jika dibutuhkan
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || ''
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || ''

function assertSupabaseConfig() {
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      'Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SECRET_KEY are required'
    )
  }
}

/**
 * Server-side Supabase client (service/secret key — full access, bypass RLS)
 * Gunakan untuk operasi server-side: upload file, admin queries
 */
export function createServerClient() {
  assertSupabaseConfig()
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Public Supabase client (publishable key — respects RLS)
 * Gunakan untuk operasi yang aman di-expose
 */
export function createPublicClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Missing Supabase environment variables: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required'
    )
  }
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Upload file ke Supabase Storage
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: Buffer | Uint8Array,
  contentType: string = 'image/jpeg'
): Promise<string> {
  const supabase = createServerClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType,
      upsert: true,
    })

  if (error) {
    throw new Error(`Upload gagal: ${error.message}`)
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return urlData.publicUrl
}

/**
 * Hapus file dari Supabase Storage
 */
export async function deleteFile(bucket: string, path: string): Promise<void> {
  const supabase = createServerClient()
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) {
    throw new Error(`Hapus file gagal: ${error.message}`)
  }
}

export { supabaseUrl, supabasePublishableKey }
