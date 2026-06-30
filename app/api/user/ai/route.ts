import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { USER_AI_TOOLS, executeUserAITool } from '@/lib/user-ai-tools'
import { prisma } from '@/lib/prisma'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(20, '1 d'),
  prefix: 'user-ai',
})

function buildSystemPrompt(userName: string, cargoName: string, customPrompt?: string | null): string {
  const custom = customPrompt?.trim()
  const prefix = custom ? `${custom}\n\n---\n\n` : ''
  return `${prefix}Чи "${cargoName}" карго компанийн хэрэглэгч ${userName}-д туслах AI юм.

Чиний цорын ганц эх сурвалж бол tool-уудаас ирсэн өгөгдөл. Өөр мэдлэг байхгүй гэж үз.

Хариулах дүрэм:
Зөвхөн tool-оос ирсэн өгөгдлийг хэл. Tool-д байхгүй зүйлийг нэмэх, таамаглах, зохиохыг хатуу хориглоно. Tool-д хариулт байхгүй бол "Мэдэгдэхгүй байна" гэж л хариул.

Tool сонгох дүрэм:
Хэрэглэгч ямар нэг зүйл ирсэн эсэх, ачааны байдал асуувал эхлээд get_my_recent_shipments дуудаж тухайн ачааг хайх. Нийт тоо статистик хэрэгтэй бол get_my_shipment_stats. Карго компанийн цаг, хаяг, тариф, банк, дүрэм асуувал get_cargo_faq дараа get_cargo_public_info дуудах.

Хэлбэр:
Цэвэр монгол хэл. Богино, ойлгомжтой 1-2 өгүүлбэр. Markdown, **, хүснэгт огт хэрэглэхгүй.
Статус орчуулга: REGISTERED тэй бол бүртгүүлсэн, EREEN_ARRIVED тэй бол Эрээнд ирсэн, ARRIVED тэй бол ирсэн, PICKED_UP тэй бол авсан гэж хэл.`
}

export async function POST(req: NextRequest) {
  const user = await getVerifiedUserFromRequest(req)
  if (!user) return unauthorized()
  if (user.role !== 'USER') return forbidden()

  const { success, remaining } = await ratelimit.limit(String(user.userId))
  if (!success) {
    return NextResponse.json(
      { error: 'Өнөөдрийн хязгаарт хүрлээ (20 мессеж). Маргааш дахин ашиглана уу.' },
      { status: 429 }
    )
  }

  let body: { messages: Array<{ role: string; content: string }>; userName?: string; cargoName?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { messages, userName = 'та', cargoName = 'карго' } = body
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages шаардлагатай' }, { status: 400 })
  }

  const userId = user.userId
  const cargoId = user.cargoId!

  const aiConfig = await (prisma as any).aiConfig.findUnique({ where: { id: 1 } })
  const customPrompt: string | null = aiConfig?.userPrompt?.trim() || null

  // Auto-greeting: хоосон messages үед мэндчилгээ
  let anthropicMessages: Array<{ role: 'user' | 'assistant'; content: any }>
  if (messages.length === 0) {
    anthropicMessages = [{ role: 'user', content: 'Сайн байна уу, миний ачааны мэдээллийг харуулаач.' }]
  } else {
    anthropicMessages = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  }

  try {
    let currentMessages = [...anthropicMessages]
    let isFirstCall = true

    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        system: buildSystemPrompt(userName, cargoName, customPrompt),
        tools: USER_AI_TOOLS as any,
        tool_choice: isFirstCall ? { type: 'any' } : { type: 'auto' },
        messages: currentMessages,
      } as any)
      isFirstCall = false

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(b => b.type === 'text')
        const reply = textBlock && textBlock.type === 'text' ? textBlock.text : ''
        return NextResponse.json({ reply, remaining })
      }

      if (response.stop_reason === 'tool_use') {
        currentMessages.push({ role: 'assistant', content: response.content })

        const toolResults = await Promise.all(
          response.content
            .filter(b => b.type === 'tool_use')
            .map(async b => {
              if (b.type !== 'tool_use') return null
              const result = await executeUserAITool(b.name, b.input as Record<string, unknown>, userId, cargoId)
              return { type: 'tool_result' as const, tool_use_id: b.id, content: result }
            })
        )

        // Inject grounding reminder after tool results to prevent hallucination
        const groundedContent: any[] = [
          ...toolResults.filter(Boolean),
          {
            type: 'text',
            text: 'Дээрх өгөгдөлд байгаа зүйлийг л хэл. Өөр юм нэмэхгүй.',
          },
        ]
        currentMessages.push({ role: 'user', content: groundedContent })
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
