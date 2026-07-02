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
    description: 'Ачааг трак код, утас, нэрээр хайж ДҮГНЭЛТ гаргана (нийт тоо, статусаар задаргаа, нийт үнэ). Жагсаалт буцаахгүй — дэлгэрэнгүйг харах холбоос буцаана.',
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
    description: 'Тодорхой статустай ачааны НИЙТ ТОО-г буцаана. Жагсаалт биш — дэлгэрэнгүйг харах хуудасны холбоос буцаана.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['REGISTERED', 'EREEN_ARRIVED', 'ARRIVED', 'PICKED_UP'],
          description: 'Ачааны статус',
        },
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
    description: 'Эрээнд ирсэн (EREEN_ARRIVED) ачааны НИЙТ ТОО-г буцаана. Жагсаалт биш — дэлгэрэнгүйг харах холбоос буцаана.',
    input_schema: {
      type: 'object',
      properties: {},
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
  {
    name: 'get_oldest_pending_shipments',
    description: 'PICKED_UP болоогүй, архивлагдаагүй ачаануудаас хамгийн удаан нэг статуст байгаа 20 ачаа. Нийт үнийн дүнг хамт буцаана.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_most_active_users',
    description: 'Сүүлийн 3 сард хамгийн олон ачаа тушаасан идэвхтэй 20 хэрэглэгч, нийт хэрэглэгчийн тооны хамт',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_top_value_users',
    description: 'Карго авсан (PICKED_UP биш, архивлагдаагүй) ачааны нийт үнийн дүнгээр хамгийн өндөр 20 хэрэглэгч',
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
          select: {
            status: true,
            adminPrice: true,
            phone: true,
            user: { select: { name: true } },
          },
        })
        const byStatus: Record<string, number> = {}
        let totalValue = 0
        const names = new Set<string>()
        const phones = new Set<string>()
        for (const s of shipments) {
          byStatus[s.status] = (byStatus[s.status] ?? 0) + 1
          totalValue += s.adminPrice ? Number(s.adminPrice) : 0
          if (s.user?.name) names.add(s.user.name)
          if (s.phone) phones.add(s.phone)
        }
        const isPhone = /^\d{6,}$/.test(query)
        const linkPhone = isPhone ? query : (phones.size === 1 ? Array.from(phones)[0] : null)
        const link = linkPhone
          ? { label: 'Тайлангаас дэлгэрэнгүй харах', href: `/admin/report?phone=${encodeURIComponent(linkPhone)}` }
          : null
        return JSON.stringify({
          summary: {
            query,
            count: shipments.length,
            byStatus,
            totalValue,
            names: Array.from(names).slice(0, 5),
          },
          ...(link ? { link } : {}),
        })
      }

      case 'get_shipments_by_status': {
        const status = String(toolInput.status)
        const count = await prisma.shipment.count({
          where: { cargoId, status: status as any, archived: false },
        })
        const pageMap: Record<string, string> = {
          REGISTERED: '/admin/registered',
          EREEN_ARRIVED: '/admin/import',
          ARRIVED: '/admin/arrived',
          PICKED_UP: '/admin/history',
        }
        const labelMap: Record<string, string> = {
          REGISTERED: 'Бүртгүүлсэн', EREEN_ARRIVED: 'Эрээнд ирсэн', ARRIVED: 'Ирсэн', PICKED_UP: 'Олгосон',
        }
        const href = pageMap[status]
        return JSON.stringify({
          summary: { status, count },
          ...(href ? { link: { label: `${labelMap[status] ?? status} ачаа харах`, href } } : {}),
        })
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
        const link = users.length === 1 && users[0].phone
          ? { label: `${users[0].name}-ийн тайлан харах`, href: `/admin/report?phone=${encodeURIComponent(users[0].phone)}` }
          : null
        return JSON.stringify({ users, ...(link ? { link } : {}) })
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
        const count = await prisma.shipment.count({
          where: { cargoId, status: 'EREEN_ARRIVED', archived: false },
        })
        return JSON.stringify({
          summary: { status: 'EREEN_ARRIVED', count },
          link: { label: 'Эрээнд ирсэн ачаа харах', href: '/admin/import' },
        })
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

      case 'get_oldest_pending_shipments': {
        const shipments = await prisma.shipment.findMany({
          where: { cargoId, archived: false, status: { not: 'PICKED_UP' } },
          take: 20,
          orderBy: { updatedAt: 'asc' },
          select: {
            id: true,
            trackCode: true,
            status: true,
            description: true,
            adminPrice: true,
            updatedAt: true,
            createdAt: true,
            user: { select: { name: true, phone: true } },
          },
        })
        const totalValue = shipments.reduce((sum, s) => sum + Number(s.adminPrice ?? 0), 0)
        return JSON.stringify({ shipments, totalValue })
      }

      case 'get_most_active_users': {
        const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        const [totalUsers, activity] = await Promise.all([
          prisma.user.count({ where: { cargoId, role: 'USER' } }),
          (prisma.shipment as any).groupBy({
            by: ['userId'],
            where: { cargoId, createdAt: { gte: threeMonthsAgo }, userId: { not: null } },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 20,
          }),
        ])
        const userIds = activity.map((a: any) => a.userId).filter(Boolean)
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, phone: true, _count: { select: { shipments: true } } },
        })
        const userMap = Object.fromEntries(users.map(u => [u.id, u]))
        const result = activity.map((a: any) => ({
          ...userMap[a.userId],
          last3MonthsShipments: a._count.id,
        }))
        return JSON.stringify({ totalUsers, activeUsers: result })
      }

      case 'get_top_value_users': {
        const byValue = await (prisma.shipment as any).groupBy({
          by: ['userId'],
          where: {
            cargoId,
            archived: false,
            status: { not: 'PICKED_UP' },
            userId: { not: null },
            adminPrice: { not: null },
          },
          _sum: { adminPrice: true },
          orderBy: { _sum: { adminPrice: 'desc' } },
          take: 20,
        })
        const userIds = byValue.map((a: any) => a.userId).filter(Boolean)
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, phone: true },
        })
        const userMap = Object.fromEntries(users.map(u => [u.id, u]))
        const result = byValue.map((a: any) => ({
          ...userMap[a.userId],
          totalValue: Number(a._sum?.adminPrice ?? 0),
        }))
        return JSON.stringify(result)
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) })
  }
}
