import { prisma } from '@/lib/prisma'

export const USER_AI_TOOLS = [
  {
    name: 'get_my_shipment_stats',
    description: 'Өөрийн ачааны статистик: статус бүрийн тоо, нийт төлбөрийн дүн. Жишээ асуултууд: "хэд төлөх вэ", "нийт хэдэн ачаатай вэ", "миний өр".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_my_shipments_by_status',
    description: 'Өөрийн ачааг статусаар шүүж харах',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['REGISTERED', 'EREEN_ARRIVED', 'ARRIVED', 'PICKED_UP'],
          description: 'Ачааны статус',
        },
        limit: { type: 'number', description: 'Хэдэн ачаа авах (1-20, өгөгдмөл 10)' },
      },
      required: ['status'],
    },
  },
  {
    name: 'get_my_recent_shipments',
    description: 'Өөрийн сүүлийн ачааны жагсаалт. Жишээ асуултууд: "ачаа минь хаана яваа", "сүүлд юу захиалсан", "ачаанууд ирсэн үү".',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Хэдэн ачаа авах (1-20, өгөгдмөл 5)' },
      },
      required: [],
    },
  },
  {
    name: 'get_cargo_public_info',
    description: 'Карго компанийн нийтийн мэдээлэл: тариф, холбоо барих, банк, зарлал, Эрээний хаяг. Жишээ: "данс хэлээч", "тариф хэд вэ", "Эрээний хаяг".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_cargo_faq',
    description: 'Карго компанийн түгээмэл асуулт хариулт (FAQ) — ажлын цаг, дүрэм, журмын асуултад ЭХЛЭЭД үүнийг дууд. Жишээ: "хэдэн цагт ажилладаг вэ", "хэзээ авч болох вэ".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
] as const

export async function executeUserAITool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: number,
  cargoId: number
): Promise<string> {
  try {
    switch (toolName) {
      case 'get_my_shipment_stats': {
        const [all, registered, ereemArrived, arrived, pickedUp, valueAgg, cargo] = await Promise.all([
          prisma.shipment.count({ where: { userId, cargoId } }),
          prisma.shipment.count({ where: { userId, cargoId, status: 'REGISTERED', archived: false } }),
          prisma.shipment.count({ where: { userId, cargoId, status: 'EREEN_ARRIVED', archived: false } }),
          prisma.shipment.count({ where: { userId, cargoId, status: 'ARRIVED', archived: false } }),
          prisma.shipment.count({ where: { userId, cargoId, status: 'PICKED_UP', archived: false } }),
          (prisma.shipment as any).aggregate({
            where: { userId, cargoId, archived: false },
            _sum: { adminPrice: true },
          }),
          (prisma.cargo as any).findUnique({ where: { id: cargoId }, select: { batchEnabled: true } }),
        ])
        const totalValue = Number(valueAgg._sum?.adminPrice ?? 0)
        const result: any = { all, registered, ereemArrived, arrived, pickedUp }
        if (totalValue > 0) result.totalValue = totalValue

        // Батч горимт карго: төлбөр багц дээр ¥-ээр хадгалагддаг
        if (cargo?.batchEnabled) {
          const batches = await (prisma as any).batch.findMany({
            where: { cargoId, userId, status: 'ARRIVED' },
            select: { price: true, shipments: { select: { id: true } } },
          })
          const batchTotalCNY = batches.reduce((s: number, b: any) => s + Number(b.price), 0)
          result.batches = {
            arrivedBatches: batches.length,
            arrivedItems: batches.reduce((s: number, b: any) => s + b.shipments.length, 0),
            batchTotalCNY,
          }
        }
        return JSON.stringify(result)
      }

      case 'get_my_shipments_by_status': {
        const status = String(toolInput.status)
        const limit = Math.min(20, Math.max(1, Number(toolInput.limit ?? 10)))
        const shipments = await prisma.shipment.findMany({
          where: { userId, cargoId, status: status as any, archived: false },
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            trackCode: true,
            description: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        })
        return JSON.stringify(shipments)
      }

      case 'get_my_recent_shipments': {
        const limit = Math.min(20, Math.max(1, Number(toolInput.limit ?? 5)))
        const shipments = await prisma.shipment.findMany({
          where: { userId, cargoId },
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            trackCode: true,
            description: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        })
        return JSON.stringify(shipments)
      }

      case 'get_cargo_public_info': {
        const cargo = await prisma.cargo.findUnique({
          where: { id: cargoId },
          select: {
            name: true,
            ereemReceiver: true,
            ereemPhone: true,
            ereemRegion: true,
            ereemAddress: true,
            tariff: true,
            announcement: true,
            contactInfo: true,
            bankName: true,
            bankAccountHolder: true,
            bankAccountNumber: true,
            bankTransferNote: true,
            arrivedLabel: true,
            ereemLabel: true,
          },
        })
        return JSON.stringify(cargo)
      }

      case 'get_cargo_faq': {
        const faqs = await prisma.faq.findMany({
          where: { cargoId },
          orderBy: { order: 'asc' },
          select: { question: true, answer: true },
        })
        return JSON.stringify(faqs)
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) })
  }
}
