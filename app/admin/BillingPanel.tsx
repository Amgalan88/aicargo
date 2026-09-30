'use client'
import { useState } from 'react'
import { Copy, Check, ChevronDown } from 'lucide-react'
import {
  billingState, renewedUntil, daysFrom, formatBillingDate,
  PRICE_PER_PERIOD, PERIOD_DAYS, GRACE_DAYS, BILLING_BANK, BILLING_PHONE,
} from '@/lib/billing'

// Вэбсайтын сунгалт — өнөөдөр төлбөл хэдий хүртэл сунгагдах, данс, төлбөр хэрхэн тооцогддог.
// Сануулга, хаагдсан цонх болон /admin/billing хуудас бүгд энэ нэг хэсгийг харуулна.
export default function BillingPanel({ cargoName, paidUntil, explainOpen = false }: {
  cargoName: string
  paidUntil: string | null
  explainOpen?: boolean
}) {
  const state = billingState(paidUntil)
  const until = renewedUntil(paidUntil, 1)
  const days = daysFrom(until)

  return (
    <div className="bp">
      <div className="bp-offer">
        <span>Өнөөдөр {PRICE_PER_PERIOD.toLocaleString('en-US')}₮ төлбөл</span>
        <b>{formatBillingDate(until)} хүртэл</b>
        <small>
          {state?.blocked
            ? `Өнөөдрөөс хойш ${days} хоног — хаагдахаас өмнө ашигласан ${state.graceUsed} хоног тооцогдоно, хаагдсан хугацааны төлбөр бодогдохгүй`
            : state && state.daysLeft < 0
              ? `Хугацаа дууссанаас хойш ашигласан ${state.graceUsed} хоног тооцогдож, ${formatBillingDate(paidUntil!)}-аас үргэлжилнэ`
              : paidUntil
                ? `Одоогийн хугацаан дээр ${PERIOD_DAYS} хоног нэмэгдэнэ`
                : `Өнөөдрөөс хойш ${days} хоног`}
        </small>
      </div>

      <div className="bp-bank">
        <Row label="Банк" value={BILLING_BANK.name} />
        <Row label="Дансны дугаар" value={BILLING_BANK.account} mono copyable />
        <Row label="Хүлээн авагч" value={BILLING_BANK.holder} />
        <Row label="Гүйлгээний утга" value={cargoName} highlight copyable />
        <Row label="Дүн" value={`${PRICE_PER_PERIOD.toLocaleString('en-US')} ₮`} highlight />
      </div>
      <p className="bp-note">Төлбөр хийсний дараа <b>{BILLING_PHONE}</b> дугаарт мэдэгдэнэ үү. Олон сараар төлж болно.</p>

      <details className="bp-how" open={explainOpen}>
        <summary>Төлбөр хэрхэн тооцогддог вэ?<ChevronDown size={16} /></summary>
        <ul>
          <li><b>Зөвхөн ашигласан хугацаандаа төлнө.</b> {PRICE_PER_PERIOD.toLocaleString('en-US')}₮ = {PERIOD_DAYS} хоног.</li>
          <li><b>Хугацаа дуусахаас өмнө төлбөл</b> одоогийн дуусах огноон дээр {PERIOD_DAYS} хоног нэмэгдэнэ — нэг ч хоног алдагдахгүй.</li>
          <li><b>Хугацаа дууссаны дараа {GRACE_DAYS} хоног</b> систем сануулгатайгаар ажилласаар байна. Энэ хугацаанд төлбөл хуучин дуусах огнооноос үргэлжилнэ.</li>
          <li><b>{GRACE_DAYS} хоногийн дараа систем хаагдана.</b> Хаагдсан хугацааны төлбөр бодогдохгүй — төлсөн өдрөөс эхэлж, хаагдахаас өмнө ашигласан {GRACE_DAYS} хоногийг хасаж сунгана.</li>
        </ul>
        <p className="bp-example">
          <b>Жишээ:</b> 8/1-нд хугацаа дуусаж, {GRACE_DAYS} хоног ажилласны дараа систем хаагдсан. 9/30-нд {PRICE_PER_PERIOD.toLocaleString('en-US')}₮ төлбөл
          ашигласан {GRACE_DAYS} хоног хасагдаж <b>10/20 хүртэл ({PERIOD_DAYS - GRACE_DAYS} хоног)</b> сунгагдана. Хаалттай байсан хугацаанд төлбөр бодохгүй.
        </p>
      </details>
    </div>
  )
}

function Row({ label, value, mono, copyable, highlight }: { label: string; value: string; mono?: boolean; copyable?: boolean; highlight?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }
  return (
    <div className="bp-row">
      <span>{label}</span>
      <div>
        <b className={`${mono ? 'bp-mono' : ''}${highlight ? ' bp-hl' : ''}`}>{value}</b>
        {copyable && (
          <button onClick={copy} title="Хуулах" aria-label="Хуулах" className={copied ? 'ok' : ''}>
            {copied ? <Check size={14} strokeWidth={2.4} /> : <Copy size={14} strokeWidth={2} />}
          </button>
        )}
      </div>
    </div>
  )
}
