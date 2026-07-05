import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { AI_TOOLS, executeAITool } from '@/lib/ai-tools'
import { prisma } from '@/lib/prisma'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const MODEL = 'gpt-4o'

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(15, '1 d'),
  prefix: 'admin-ai',
})

const CLARIFY_TOOL = {
  name: 'ask_clarification',
  description: 'Асуулт тодорхойгүй эсвэл олон утгатай байвал энэ tool-ыг дуудаж тодруулна.',
  input_schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'Тодруулах товч асуулт (1 өгүүлбэр)' },
      options: { type: 'array', items: { type: 'string' }, description: '2-4 товч сонголт', minItems: 2, maxItems: 4 },
    },
    required: ['question', 'options'],
  },
}

function toOpenAITools(tools: any[]) {
  return tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }))
}

const DEFAULT_ADMIN_PROMPT = `Чи карго компанийн админд туслах ЗАДЛАН ШИНЖИЛГЭЭНИЙ AI туслах юм.

Гол үүрэг: тоон дүгнэлт, статистик, чиг хандлага гаргах (нийт тоо, статусаар задаргаа, орлого, удаан гацсан ачаа, идэвхтэй/өндөр дүнтэй хэрэглэгч).

Эх сурвалж: зөвхөн tool-оос ирсэн өгөгдөл. Таамаглах, нэмэх, зохиохыг хатуу хориглоно. Байхгүй бол "Мэдэгдэхгүй байна" гэж хэл.
Tool дуудаад үр дүн авсны дараа ЗААВАЛ монголоор богино текстэн хариулт бич.

Ачаа/хэрэглэгч ХАЙХ (утас, нэр, трак код):
- Жагсаалтыг битгий нэг нэгээр нь бич. Оронд нь ДҮГНЭЛТ хэл: нийт хэдэн ачаа, статусаар задаргаа, нийт үнэ.
- tool-ийн үр дүнд link байвал "дэлгэрэнгүйг доорх холбоосоор үзнэ үү" гэж товч хэл. Холбоосыг өөрөө бүү бич — систем автоматаар товч харуулна.

ask_clarification: зөвхөн асуулт ОГТ ойлгогдохгүй үед (2-3 сонголт). Энгийн хайлт/статистикт бүү тодруул.

Хариултын хэлбэр — ЗААВАЛ ДАГАХ:
- Хамгийн богино байх. 1-2 өгүүлбэр хангалттай бол илүү бичихгүй.
- Тоон өгөгдөл: зөвхөн тоо+нэр, тайлбаргүй.
- Ранк жагсаалт (топ хэрэглэгч, удаан гацсан): "нэр — утга" форматаар мөр бүрт нэг зүйл.
- Markdown, **, хүснэгт, урт тайлбар огт хэрэглэхгүй.
- Статус: REGISTERED→бүртгүүлсэн, EREEN_ARRIVED→Эрээнд ирсэн, ARRIVED→ирсэн, PICKED_UP→олгосон.
- Огноо: "6/25" гэж товчлон хэл.`

function buildAdminPrompt(customPrompt?: string | null): string {
  const custom = customPrompt?.trim()
  return custom ? `${custom}\n\n---\n\n${DEFAULT_ADMIN_PROMPT}` : DEFAULT_ADMIN_PROMPT
}

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') return forbidden()

  const cargoId = admin.cargoId!

  const cargoRec = await prisma.cargo.findUnique({ where: { id: cargoId }, select: { aiEnabled: true } })
  if (!cargoRec?.aiEnabled) {
    return NextResponse.json({ error: 'AI туслах энэ каргод идэвхжээгүй байна' }, { status: 403 })
  }

  const aiConfig = await (prisma as any).aiConfig.findUnique({ where: { id: 1 } })
  const customPrompt: string | null = aiConfig?.adminPrompt?.trim() || null

  const { success, remaining } = await ratelimit.limit(String(admin.userId))
  if (!success) {
    return NextResponse.json(
      { error: 'Өнөөдрийн хязгаарт хүрлээ (15 мессеж). Маргааш дахин ашиглана уу.' },
      { status: 429 }
    )
  }

  let body: { messages: Array<{ role: string; content: string }> }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { messages } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages шаардлагатай' }, { status: 400 })
  }

  const tools = toOpenAITools([...AI_TOOLS, CLARIFY_TOOL])

  const currentMessages: any[] = [
    { role: 'system', content: buildAdminPrompt(customPrompt) },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ]

  try {
    let isFirst = true
    let toolsExecuted = false
    let capturedLink: { label: string; href: string } | null = null
    while (true) {
      const response = await openai.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1000,
        tools,
        tool_choice: isFirst ? 'required' : toolsExecuted ? 'none' : 'auto',
        messages: currentMessages,
      })
      isFirst = false

      const choice = response.choices[0]

      if (choice.finish_reason === 'stop' || choice.finish_reason === 'length') {
        const reply = choice.message.content || 'Өгөгдөл олдсонгүй.'
        return NextResponse.json({ reply, ...(capturedLink ? { link: capturedLink } : {}), remaining })
      }

      if (choice.finish_reason === 'tool_calls') {
        type FnToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
        const fnCalls = (choice.message.tool_calls ?? []).filter(tc => tc.type === 'function') as FnToolCall[]
        const clarifyCall = fnCalls.find(tc => tc.function.name === 'ask_clarification')
        if (clarifyCall) {
          const input = JSON.parse(clarifyCall.function.arguments)
          return NextResponse.json({ clarify: true, question: input.question, options: input.options, remaining })
        }

        currentMessages.push(choice.message)

        for (const toolCall of fnCalls) {
          const input = JSON.parse(toolCall.function.arguments)
          const result = await executeAITool(toolCall.function.name, input, cargoId)
          try {
            const parsed = JSON.parse(result)
            if (parsed?.link?.href) capturedLink = parsed.link
          } catch {}
          // Хэрэглэгчийн бичсэн текст агуулж болзошгүй тул <data>-д боож өгнө
          currentMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: `<data>${result}</data>` })
        }
        toolsExecuted = true
        continue
      }

      break
    }

    return NextResponse.json({ reply: 'Алдаа гарлаа. Дахин оролдоно уу.', remaining })
  } catch (err: any) {
    console.error('Admin AI error:', err)
    return NextResponse.json({ error: 'AI алдаа гарлаа' }, { status: 500 })
  }
}
