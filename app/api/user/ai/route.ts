import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getVerifiedUserFromRequest, unauthorized, forbidden } from '@/lib/auth'
import { USER_AI_TOOLS, executeUserAITool } from '@/lib/user-ai-tools'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(20, '1 d'),
  prefix: 'user-ai',
})

function buildSystemPrompt(userName: string, cargoName: string): string {
  return `Та "${cargoName}" карго компанийн хэрэглэгч ${userName}-д туслах AI юм. Монгол хэлээр товч, найрсаг хариулна уу.

Чадвар:
- Хэрэглэгчийн өөрийн ачааны мэдээлэл харах (бусад хэрэглэгчийн мэдээлэл харахгүй)
- Карго компанийн нийтийн мэдээлэл өгөх (тариф, банк, холбоо барих, цагийн хуваарь)
- FAQ-аас хариулт олох

Дүрмүүд:
- Статус нэршлийг монголоор тайлбарла: REGISTERED=Бүртгүүлсэн, EREEN_ARRIVED=Эрээнд ирсэн, ARRIVED=Ирсэн, PICKED_UP=Авсан
- Огноог уншигдах хэлбэрт хөрвүүл
- Мэдэгдэхгүй зүйлийг таахгүйгээр tool ашиглан шалга
- Хариулт товч, мессенжер хэв маягт байлга`
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

  // Auto-greeting: хоосон messages үед мэндчилгээ
  let anthropicMessages: Array<{ role: 'user' | 'assistant'; content: any }>
  if (messages.length === 0) {
    anthropicMessages = [{ role: 'user', content: 'Сайн байна уу, миний ачааны мэдээллийг харуулаач.' }]
  } else {
    anthropicMessages = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  }

  try {
    let currentMessages = [...anthropicMessages]

    while (true) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        system: buildSystemPrompt(userName, cargoName),
        tools: USER_AI_TOOLS as any,
        messages: currentMessages,
      })

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

        currentMessages.push({ role: 'user', content: toolResults.filter(Boolean) as any })
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
