import { prisma } from './prisma'

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'VOID' | 'LOGIN' | 'CLOSE_DAY' | 'REOPEN_DAY' | 'APPROVE' | 'REJECT'

export async function createAuditLog(params: {
  userId: string
  aksi: AuditAction
  entitas: string
  entitasId?: string
  dataBefore?: Record<string, unknown>
  dataAfter?: Record<string, unknown>
  keterangan?: string
}) {
  return prisma.auditLog.create({
    data: {
      userId: params.userId,
      aksi: params.aksi,
      entitas: params.entitas,
      entitasId: params.entitasId,
      dataBefore: params.dataBefore ? JSON.stringify(params.dataBefore) : null,
      dataAfter: params.dataAfter ? JSON.stringify(params.dataAfter) : null,
      keterangan: params.keterangan,
    },
  })
}
