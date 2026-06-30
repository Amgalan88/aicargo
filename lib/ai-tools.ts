import { prisma } from '@/lib/prisma'

// ---- Tool definitions (sent to Claude) ----

export const AI_TOOLS = [
  {
    name: 'get_shipment_stats',
    description: 'Ачааны статистик мэдээлэл: нийт тоо, статус бүрийн тоо, архивласан тоо',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_shipments',
    description: 'Ачаа хайх — трак код, утасны дугаар, эсвэл нэрээр. Хамгийн ихдээ 20 үр дүн буцаана.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Хайх текст (трак код, утас, нэр)' },
        status: {
          type: 'string',
          enum: ['REGISTERED', 'EREEN_ARRIVED', 'ARRIVED', 'PICKED_UP'],
          description: 'Статусаар шүүх (заавал биш)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_shipments_by_status',
    description: 'Тодорхой статустай ачааны жагсаалт авах. Хамгийн ихдээ 50 ачаа буцаана.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['REGISTERED', 'EREEN_ARRIVED', 'ARRIVED', 'PICKED_UP'],
          description: 'Ачааны статус',
        },
        limit: { type: 'number', description: 'Хэдэн ачаа авах (1-50, өгөгдмөл 20)' },
      },
      required: ['status'],
    },
  },
  {
    name: 'get_recent_shipments',
    description: 'Сүүлийн N ачааны мэдээлэл',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Хэдэн ачаа авах (1-50, өгөгдмөл 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_user_info',
    description: 'Хэрэглэгчийн мэдээлэл — утасны дугаар эсвэл нэрээр хайх',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Утасны дугаар эсвэл нэр' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_cargo_info',
    description: 'Энэ каргогийн үндсэн мэдээлэл: нэр, холбоо барих, банкны мэдээлэл, тариф гэх мэт',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_notifications',
    description: 'Сүүлийн мэдэгдлүүд',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Хэдэн мэдэгдэл авах (1-20, өгөгдмөл 10)' },
        unread_only: { type: 'boolean', description: 'Зөвхөн уншаагүй мэдэгдлүүд' },
      },
      required: [],
    },
  },
  {
    name: 'get_faq_list',
    description: 'Энэ каргогийн FAQ жагсаалт',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_ereen_arrived_details',
    description: 'Эрээнд ирсэн (EREEN_ARRIVED) ачааны жагсаалт — Монголд удахгүй ирэх ачаа',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Хэдэн ачаа авах (1-50, өгөгдмөл 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_arrival_stats_by_date',
    description: 'Сүүлийн 7 хоногт өдөр бүр хэдэн ачаа ARRIVED статуст шилжсэн тоо',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
] as const

// ---- Tool execution functions (all scoped by cargoId) ----

export async function executeAITool(
  toolName: string,
  toolInput: Record<string, unknown>,
  cargoId: number
): Promise<string> {
  try {
    switch (toolName) {
      case 'get_shipment_stats': {
        const [total, registered, ereemArrived, arrived, pickedUp, archived] = await Promise.all([
          prisma.shipment.count({ where: { cargoId } }),
          prisma.shipment.count({ where: { cargoId, status: 'REGISTERED', archived: false } }),
          prisma.shipment.count({ where: { cargoId, status: 'EREEN_ARRIVED', archived: false } }),
          prisma.shipment.count({ where: { cargoId, status: 'ARRIVED', archived: false } }),
          prisma.shipment.count({ where: { cargoId, status: 'PICKED_UP', archived: false } }),
          prisma.shipment.count({ where: { cargoId, archived: true } }),
        ])
        return JSON.stringify({ total, registered, ereemArrived, arrived, pickedUp, archived })
      }

      case 'search_shipments': {
        const query = String(toolInput.query ?? '').trim()
        const status = toolInput.status as string | undefined
        const where: any = { cargoId }
        if (status) where.status = status
        where.OR = [
          { trackCode: { contains: query.toUpperCase() } },
          { phone: { contains: query } },
          { user: { phone: { contains: query } } },
          { user: { name: { contains: query } } },
        ]
        const shipments = await prisma.shipment.findMany({
          where,
          take: 20,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            trackCode: true,
            status: true,
            description: true,
            phone: true,
            adminNote: true,
            archived: true,
            createdAt: true,
            user: { select: { name: true, phone: true } },
          },
        })
        return JSON.stringify(shipments)
      }

      case 'get_shipments_by_status': {
        const status = String(toolInput.status)
        const limit = Math.min(50, Math.max(1, Number(toolInput.limit ?? 20)))
        const shipments = await prisma.shipment.findMany({
          where: { cargoId, status: status as any, archived: false },
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            trackCode: true,
            description: true,
            phone: true,
            adminNote: true,
            createdAt: true,
            updatedAt: true,
            user: { select: { name: true, phone: true } },
          },
        })
        return JSON.stringify(shipments)
      }

      case 'get_recent_shipments': {
        const limit = Math.min(50, Math.max(1, Number(toolInput.limit ?? 10)))
        const shipments = await prisma.shipment.findMany({
          where: { cargoId },
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            trackCode: true,
            status: true,
            description: true,
            createdAt: true,
            user: { select: { name: true, phone: true } },
          },
        })
        return JSON.stringify(shipments)
      }

      case 'get_user_info': {
        const query = String(toolInput.query ?? '').trim()
        const users = await prisma.user.findMany({
          where: {
            cargoId,
            OR: [
              { phone: { contains: query } },
              { name: { contains: query } },
            ],
          },
          take: 10,
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            role: true,
            createdAt: true,
            _count: { select: { shipments: true } },
          },
        })
        return JSON.stringify(users)
      }

      case 'get_cargo_info': {
        const cargo = await prisma.cargo.findUnique({
          where: { id: cargoId },
          select: {
            name: true,
            slug: true,
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
            searchByPhone: true,
            notificationsEnabled: true,
            paidUntil: true,
          },
        })
        return JSON.stringify(cargo)
      }

      case 'get_notifications': {
        const limit = Math.min(20, Math.max(1, Number(toolInput.limit ?? 10)))
        const unreadOnly = toolInput.unread_only === true
        const notifications = await prisma.notification.findMany({
          where: { cargoId, archived: false, ...(unreadOnly ? { read: false } : {}) },
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            read: true,
            createdAt: true,
          },
        })
        return JSON.stringify(notifications)
      }

      case 'get_faq_list': {
        const faqs = await prisma.faq.findMany({
          where: { cargoId },
          orderBy: { order: 'asc' },
          select: { id: true, question: true, answer: true, order: true },
        })
        return JSON.stringify(faqs)
      }

      case 'get_ereen_arrived_details': {
        const limit = Math.min(50, Math.max(1, Number(toolInput.limit ?? 20)))
        const shipments = await prisma.shipment.findMany({
          where: { cargoId, status: 'EREEN_ARRIVED', archived: false },
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            trackCode: true,
            description: true,
            updatedAt: true,
            user: { select: { name: true, phone: true } },
          },
        })
        return JSON.stringify(shipments)
      }

      case 'get_arrival_stats_by_date': {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const shipments = await prisma.shipment.findMany({
          where: {
            cargoId,
            status: 'ARRIVED',
            updatedAt: { gte: sevenDaysAgo },
          },
          select: { updatedAt: true },
        })
        const byDate: Record<string, number> = {}
        for (const s of shipments) {
          const d = s.updatedAt.toISOString().slice(0, 10)
          byDate[d] = (byDate[d] ?? 0) + 1
        }
        return JSON.stringify(byDate)
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) })
  }
}
