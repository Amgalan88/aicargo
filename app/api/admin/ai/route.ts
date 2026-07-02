import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { AI_TOOLS, executeAITool } from '@/lib/ai-tools'
import { prisma } from '@/lib/prisma'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const MODEL = 'gpt-5-mini'

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(30, '1 d'),
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

const DEFAULT_ADMIN_PROMPT = `Чи карго компанийн админд туслах AI юм.

Эх сурвалж: зөвхөн tool-оос ирсэн өгөгдөл. Таамаглах, нэмэх, зохиохыг хатуу хориглоно. Байхгүй бол "Мэдэгдэхгүй байна" гэж хэл.
Асуулт тодорхойгүй → ask_clarification (2-3 сонголт).

Хариултын хэлбэр — ЗААВАЛ ДАГАХ:
- Хамгийн богино байх. 1-2 өгүүлбэр хангалттай бол илүү бичихгүй.
- Тоон өгөгдөл: зөвхөн тоо+нэр, тайлбаргүй.
- Жагсаалт: "нэр — утга" форматаар мөр бүрт нэг зүйл.
- Markdown, **, хүснэгт, тайлбар огт хэрэглэхгүй.
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

  const aiConfig = await (prisma as any).aiConfig.findUnique({ where: { id: 1 } })
  const customPrompt: string | null = aiConfig?.adminPrompt?.trim() || null

  const { success, remaining } = await ratelimit.limit(String(admin.userId))
  if (!success) {
    return NextResponse.json(
      { error: 'Өнөөдрийн хязгаарт хүрлээ (30 мессеж). Маргааш дахин ашиглана уу.' },
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
    while (true) {
      const response = await openai.chat.completions.create({
        model: MODEL,
        max_tokens: 500,
        tools,
        tool_choice: isFirst ? 'required' : 'auto',
        messages: currentMessages,
      })
      isFirst = false

      const choice = response.choices[0]

      if (choice.finish_reason === 'stop') {
        return NextResponse.json({ reply: choice.message.content ?? '', remaining })
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
          currentMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result })
        }
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
