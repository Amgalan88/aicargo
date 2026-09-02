import { Prisma, PrismaClient } from '@prisma/client'

type AuditClient = PrismaClient | Prisma.TransactionClient

export interface AuditEntry {
  cargoId: number
  userId: number
  userName: string
  action: string
  detail?: string | null
}

// Аудит бичлэг амжилтгүй болсон ч гол үйлдлийг унагаахгүй — зөвхөн лог алдана.
// Тиймээс $transaction дотор (аудит бичихгүй бол бүх үйлдлийг rollback хийх шаардлагатай
// үед) шууд `tx.adminAuditLog.create(...)` дуудна, энэ helper-г биш.
export async function logAdminAction(client: AuditClient, entry: AuditEntry): Promise<void> {
  try {
    await client.adminAuditLog.create({
      data: {
        cargoId: entry.cargoId,
        userId: entry.userId,
        userName: entry.userName,
        action: entry.action,
        detail: entry.detail ?? null,
      },
    })
  } catch (err) {
    console.error('logAdminAction failed:', entry.action, err)
  }
}
