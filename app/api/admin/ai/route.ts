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
  limiter: Ratelimit.slidingWindow(100, '1 d'),
  prefix: 'admin-ai',
})

const DEFAULT_ADMIN_PROMPT = `Чи карго компанийн админд туслах AI юм.

Чиний цорын ганц эх сурвалж бол tool-уудаас ирсэн өгөгдөл. Өөр мэдлэг байхгүй гэж үз.

Хариулах дүрэм:
Зөвхөн tool-оос ирсэн өгөгдлийг хэл. Tool-д байхгүй зүйлийг нэмэх, таамаглах, зохиохыг хатуу хориглоно. Tool-д хариулт байхгүй бол "Мэдэгдэхгүй байна" гэж л хариул.

Хэлбэр:
Цэвэр монгол хэл. Богино, ойлгомжтой 1-3 өгүүлбэр. Markdown, **, хүснэгт огт хэрэглэхгүй.
Статус орчуулга: REGISTERED тэй бол бүртгүүлсэн, EREEN_ARRIVED тэй бол Эрээнд ирсэн, ARRIVED тэй бол ирсэн, PICKED_UP тэй бол олгосон гэж хэл.
Огноо: "6 сарын 25" гэж товчлон хэл.`

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
        max_tokens: 1024,
        system: buildAdminPrompt(customPrompt),
        tools: AI_TOOLS as any,
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
