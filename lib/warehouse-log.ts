import { Prisma, PrismaClient } from '@prisma/client'

type LogClient = PrismaClient | Prisma.TransactionClient

export const WAREHOUSE_FIELD_LABELS: Record<string, string> = {
  slug: 'Холбоос',
  legalNameMn: 'Нэр (монгол)',
  legalNameCn: 'Нэр (хятад)',
  registerNo: 'Регистр',
  directorName: 'Захирал',
  bankName: 'Банк',
  bankAccount: 'Дансны дугаар',
  bankHolder: 'Данс эзэмшигч',
  contractFee: 'Гэрээний төлбөр',
  services: 'Үйлчилгээ',
  pricePerTonCny: '1 тонны тариф',
  pricePerM3Cny: '1 м³ тариф',
  acceptingContracts: 'Гэрээ хүлээн авах',
}

// Эдгээр талбарын өөрчлөлт мөнгө хаашаа орохыг тодорхойлно — түүхэнд тусад нь тэмдэглэнэ
const BANK_FIELDS = new Set(['bankName', 'bankAccount', 'bankHolder'])

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Тийм' : 'Үгүй'
  if (typeof v === 'object' && 'toString' in v) return String(v)
  return String(v).length > 80 ? String(v).slice(0, 80) + '…' : String(v)
}

// Өмнөх ба шинэ утгыг харьцуулж, өөрчлөгдсөн талбар бүрийг "Нэр: хуучин → шинэ" хэлбэрээр буцаана
export function diffWarehouse(before: Record<string, unknown>, after: Record<string, unknown>) {
  const bank: string[] = []
  const other: string[] = []
  for (const key of Object.keys(WAREHOUSE_FIELD_LABELS)) {
    if (!(key in after)) continue
    const a = show(before[key])
    const b = show(after[key])
    if (a === b) continue
    const line = `${WAREHOUSE_FIELD_LABELS[key]}: ${a} → ${b}`
    ;(BANK_FIELDS.has(key) ? bank : other).push(line)
  }
  return { bank, other }
}

export interface WarehouseLogEntry {
  warehouseId: number
  userId: number
  userName: string
  action: string
  detail?: string | null
}

// Лог бичих алдаа гол үйлдлийг унагаахгүй (lib/audit.ts-тэй адил дүрэм)
export async function logWarehouseAction(client: LogClient, entry: WarehouseLogEntry): Promise<void> {
  try {
    await client.warehouseLog.create({
      data: {
        warehouseId: entry.warehouseId,
        userId: entry.userId,
        userName: entry.userName,
        action: entry.action,
        detail: entry.detail ?? null,
      },
    })
  } catch (err) {
    console.error('logWarehouseAction failed:', entry.action, err)
  }
}

export const WAREHOUSE_LOG_ACTIONS: Record<string, string> = {
  BANK_CHANGED: 'Данс өөрчилсөн',
  SETTINGS_CHANGED: 'Тохиргоо өөрчилсөн',
  IMAGE_ADDED: 'Зураг нэмсэн',
  IMAGE_DELETED: 'Зураг устгасан',
  SECTION_ADDED: 'Зай талбай нэмсэн',
  SECTION_UPDATED: 'Зай талбай засварласан',
  SECTION_DELETED: 'Зай талбай устгасан',
}
