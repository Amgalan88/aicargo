import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { AI_TOOLS, executeAITool } from '@/lib/ai-tools'
import { prisma } from '@/lib/prisma'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

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
  description: 'Асуулт тодорхойгүй эсвэл олон утгатай байвал энэ tool-ыг дуудаж тодруулна. Ямар tool дуудахаа мэдэхгүй байвал заавал энэ tool ашигла.',
  input_schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'Тодруулах товч асуулт (1 өгүүлбэр)' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: '2-4 товч сонголт',
        minItems: 2,
        maxItems: 4,
      },
    },
    required: ['question', 'options'],
  },
}

const DEFAULT_ADMIN_PROMPT = `Чи карго компанийн админд туслах AI юм.

Эх сурвалж: зөвхөн tool-оос ирсэн өгөгдөл. Таамаглах, нэмэх, зохиохыг хатуу хориглоно. Байхгүй бол "Мэдэгдэхгүй байна" гэж хэл.
Асуулт тодорхойгүй → ask_clarification (2-3 сонголт).

Хариултын хэлбэр — ЗААВАЛ ДАГАХ:
- Хамгийн богино байх. 1-2 өгүүлбэр хангалттай бол илүү бичихгүй.
- Тоон өгөгдөл: зөвхөн тоо+нэр, тайлбаргүй.
- Жагсаалт гаргахад: "нэр — утга" форматаар мөр бүрт нэг зүйл.
- Markdown, **, хүснэгт, тайлбар, танилцуулга огт хэрэглэхгүй.
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
      { error: 'Өнөөдрийн хязгаарт хүрлээ (100 мессеж). Маргааш дахин ашиглана уу.' },
      { status: 429 }
    )
  }

  let body: { messages: Array<{ role: string; content: string }> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { messages } = body
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages шаардлагатай' }, { status: 400 })
  }

  // Convert to Anthropic message format
  const anthropicMessages = messages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  try {
    let currentMessages = [...anthropicMessages]
    let isFirstCall = true

    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        system: buildAdminPrompt(customPrompt),
        tools: [...AI_TOOLS, CLARIFY_TOOL] as any,
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
        const clarifyBlock = response.content.find(
          b => b.type === 'tool_use' && b.name === 'ask_clarification'
        )
        if (clarifyBlock && clarifyBlock.type === 'tool_use') {
          const { question, options } = clarifyBlock.input as { question: string; options: string[] }
          return NextResponse.json({ clarify: true, question, options, remaining })
        }

        // Add assistant's response (with tool calls) to the conversation
        currentMessages.push({ role: 'assistant', content: response.content as any })

        // Execute all tool calls in parallel
        const toolResults = await Promise.all(
          response.content
            .filter(b => b.type === 'tool_use')
            .map(async b => {
              if (b.type !== 'tool_use') return null
              const result = await executeAITool(b.name, b.input as Record<string, unknown>, cargoId)
              return {
                type: 'tool_result' as const,
                tool_use_id: b.id,
                content: result,
              }
            })
        )

        currentMessages.push({
          role: 'user',
          content: [
            ...toolResults.filter(Boolean),
            { type: 'text', text: 'Дээрх өгөгдөлд байгаа зүйлийг л хэл. Өөр юм нэмэхгүй.' },
          ] as any,
        })
        continue
      }

      // Unexpected stop reason
      break
    }

    return NextResponse.json({ reply: 'Алдаа гарлаа. Дахин оролдоно уу.' })
  } catch (err: any) {
    console.error('AI route error:', err)
    return NextResponse.json({ error: 'AI алдаа гарлаа' }, { status: 500 })
  }
}
