import crypto from 'crypto'

// Byl (byl.mn) төлбөрийн API — нэхэмжлэх үүсгэх, шалгах, webhook-ийн гарын үсэг баталгаажуулах.
// https://byl.mn/docs/api/invoices.html · https://byl.mn/docs/webhook.html

const BASE = 'https://byl.mn/api/v1'

export function bylConfigured(): boolean {
  return !!(process.env.BYL_TOKEN && process.env.BYL_PROJECT_ID)
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/projects/${process.env.BYL_PROJECT_ID}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.BYL_TOKEN}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  let json: { data?: T; message?: string } = {}
  try { json = JSON.parse(text) } catch {}
  if (!res.ok || !json.data) throw new Error(`Byl ${method} ${path} → ${res.status} ${json.message ?? text.slice(0, 120)}`)
  return json.data
}

export interface BylInvoice {
  id: number
  status: 'draft' | 'open' | 'paid' | 'void'
  amount: string | number
  description: string | null
  client_reference_id: string | null
  url: string
  due_date: string | null
  updated_at: string
}

export function createInvoice(input: { amount: number; description: string; clientReferenceId: string; dueDate?: Date }): Promise<BylInvoice> {
  return call<BylInvoice>('POST', '/invoices', {
    amount: input.amount,
    description: input.description.slice(0, 255),
    client_reference_id: input.clientReferenceId.slice(0, 48),
    auto_advance: true,
    ...(input.dueDate ? { due_date: input.dueDate.toISOString() } : {}),
  })
}

export function getInvoice(id: number): Promise<BylInvoice> {
  return call<BylInvoice>('GET', `/invoices/${id}`)
}

// Byl-Signature: түүхий body-ийн HMAC-SHA256 (hex). Тогтмол хугацаанд харьцуулна
export function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.BYL_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(signature.trim().toLowerCase())
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
