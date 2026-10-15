import { NextRequest, NextResponse } from 'next/server'
import { verifySignature } from '@/lib/byl'
import { settleBylInvoice } from '@/lib/billing-pay'

// Byl webhook — invoice.paid ирэхэд каргогийн хугацааг сунгана.
// Гарын үсгийг түүхий body дээр шалгана; сунгахаасаа өмнө нэхэмжлэхийг Byl-ээс дахин татаж баталгаажуулна.
// Нэг үйл явдал дахин ирсэн ч (retry) давхар сунгахгүй — settleBylInvoice нэг л удаа ажиллана.
export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('byl-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  let ev: { type?: string; data?: { object?: { id?: number } } } = {}
  try { ev = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  if (ev.type === 'invoice.paid' && ev.data?.object?.id) {
    try {
      const r = await settleBylInvoice(Number(ev.data.object.id))
      return NextResponse.json({ ok: true, result: r })
    } catch (e) {
      console.error('byl webhook settle', e)
      // 5xx буцаавал Byl дахин илгээнэ
      return NextResponse.json({ error: 'settle failed' }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true, ignored: ev.type ?? null })
}
