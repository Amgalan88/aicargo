import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { AI_TOOLS, executeAITool } from '@/lib/ai-tools'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(100, '1 d'),
  prefix: 'admin-ai',
})

const SYSTEM_PROMPT = `Та "AiCargo" карго компанийн Admin AI туслах юм. Монгол хэлээр хариулна уу.

Таны үүрэг:
- Администраторт каргогийн датабаазаас мэдээлэл авч өгөх
- Ачааны статус, статистик, хэрэглэгчийн мэдээллийг тайлбарлах
- Товч, тодорхой хариулт өгөх

Чухал дүрмүүд:
- Зөвхөн өөрт байгаа tool-уудаар датабаазаас мэдээлэл аваарай
- Мэдэгдэхгүй зүйлийг таахгүйгээр "мэдэгдэхгүй байна" гэж хэлнэ
- Датабаазын техникийн нэршлийг (REGISTERED, EREEN_ARRIVED гэх мэт) монголоор тайлбарлаарай:
  REGISTERED = Бүртгүүлсэн, EREEN_ARRIVED = Эрээнд ирсэн, ARRIVED = Ирсэн, PICKED_UP = Олгосон
- Огноог уншигдах хэлбэрт хөрвүүлэн тайлбарлаарай`

export async function POST(req: NextRequest) {
  const admin = await getVerifiedUserFromRequest(req)
  if (!admin) return unauthorized()
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') return forbidden()

  const cargoId = admin.cargoId!

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
    // Agentic loop: keep going until Claude stops requesting tool calls
    let currentMessages = [...anthropicMessages]

    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: AI_TOOLS as any,
        messages: currentMessages,
      })

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
          content: toolResults.filter(Boolean) as any,
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
