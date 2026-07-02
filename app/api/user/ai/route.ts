import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { USER_AI_TOOLS, executeUserAITool } from '@/lib/user-ai-tools'
import { prisma } from '@/lib/prisma'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const MODEL = 'gpt-5-mini'

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(10, '1 d'),
  prefix: 'user-ai',
})

const CLARIFY_TOOL = {
  name: 'ask_clarification',
  description: 'Хэрэглэгчийн асуулт тодорхойгүй эсвэл олон утгатай байвал энэ tool-ыг дуудаж тодруулна. Ямар tool дуудахаа мэдэхгүй байвал заавал энэ tool ашигла.',
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

function buildSystemPrompt(userName: string, cargoName: string, customPrompt?: string | null): string {
  const custom = customPrompt?.trim()
  const prefix = custom ? `${custom}\n\n---\n\n` : ''
  return `${prefix}Чи "${cargoName}" карго компанийн хэрэглэгч ${userName}-д туслах AI юм.

Эх сурвалж: зөвхөн tool-оос ирсэн өгөгдөл. Таамаглах, нэмэх, зохиохыг хатуу хориглоно. Байхгүй бол "Мэдэгдэхгүй байна" гэж хэл.

Tool сонгох:
- Ачааны байдал, ирсэн эсэх → get_my_recent_shipments
- Нийт тоо, статистик → get_my_shipment_stats
- Карго компанийн цаг, хаяг, банк, тариф, дүрэм, холбоо барих → ЗААВАЛ get_cargo_faq дуудах. Хариулт олдохгүй бол get_cargo_public_info ч дуудах.
- Асуулт тодорхойгүй → ask_clarification (2-3 сонголт)

Хариултын хэлбэр — ЗААВАЛ ДАГАХ:
- Хамгийн богино байх. 1 өгүүлбэр хангалттай бол 2 бичихгүй.
- Тоон өгөгдөл: зөвхөн тоо+нэр, тайлбаргүй.
- Ачааны жагсаалт: "trackCode — статус" форматаар мөр бүрт нэг ачаа.
- Markdown, **, огт хэрэглэхгүй. Тайлбар, танилцуулга бичихгүй.
- Статус: REGISTERED→бүртгүүлсэн, EREEN_ARRIVED→Эрээнд ирсэн, ARRIVED→ирсэн, PICKED_UP→авсан.`
}

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'USER') return forbidden()

  const { success, remaining } = await ratelimit.limit(String(user.userId))
  if (!success) {
    return NextResponse.json(
      { error: 'Өнөөдрийн хязгаарт хүрлээ (10 мессеж). Маргааш дахин ашиглана уу.' },
      { status: 429 }
    )
  }

  let body: { messages: Array<{ role: string; content: string }>; userName?: string; cargoName?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { messages, userName = 'та', cargoName = 'карго' } = body
  if (!Array.isArray(messages)) return NextResponse.json({ error: 'messages шаардлагатай' }, { status: 400 })

  const userId = user.userId
  const cargoId = user.cargoId!

  const aiConfig = await (prisma as any).aiConfig.findUnique({ where: { id: 1 } })
  const customPrompt: string | null = aiConfig?.userPrompt?.trim() || null

  const tools = toOpenAITools([...USER_AI_TOOLS, CLARIFY_TOOL])

  const inputMessages = messages.length === 0
    ? [{ role: 'user' as const, content: 'Сайн байна уу, миний ачааны мэдээллийг харуулаач.' }]
    : messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const currentMessages: any[] = [
    { role: 'system', content: buildSystemPrompt(userName, cargoName, customPrompt) },
    ...inputMessages,
  ]

  try {
    let isFirst = true
    while (true) {
      const response = await openai.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 800,
        tools,
        tool_choice: isFirst ? 'required' : 'auto',
        messages: currentMessages,
      })
      isFirst = false

      const choice = response.choices[0]

      if (choice.finish_reason === 'stop' || choice.finish_reason === 'length') {
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
          const result = await executeUserAITool(toolCall.function.name, input, userId, cargoId)
          currentMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: result })
        }
        continue
      }

      break
    }

    return NextResponse.json({ reply: 'Алдаа гарлаа. Дахин оролдоно уу.', remaining })
  } catch (err) {
    console.error('User AI error:', err)
    return NextResponse.json({ error: 'AI алдаа гарлаа' }, { status: 500 })
  }
}
