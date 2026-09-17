import Link from 'next/link'
import NavLogo from '@/app/components/NavLogo'
import { prisma } from '@/lib/prisma'
import { STATUS_INFO, ContractStatus, formatDateTime } from '@/lib/contract'
import { safeValues } from '@/lib/contract-server'

export const revalidate = 0
export const metadata = { title: 'Гэрээ шалгах — Aicargo', robots: { index: false } }

// PDF дээрх холбоос — гэрээний агуулгыг биш, зөвхөн хүчинтэй эсэх, талууд, хяналтын кодыг харуулна
export default async function VerifyContractPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params
  const c = /^AC\d{4}-\d{5,}$/.test(no)
    ? await prisma.warehouseContract.findFirst({
        where: { contractNo: no, status: { in: ['ACTIVE', 'TERMINATION_PENDING', 'TERMINATED'] } },
        select: {
          contractNo: true, status: true, values: true, bodyHash: true, cargoSignedAt: true, approvedAt: true,
          terminatedAt: true, terminationEffectiveAt: true,
          warehouse: { select: { name: true, legalNameMn: true, legalNameCn: true } },
        },
      })
    : null

  const info = c ? STATUS_INFO[c.status as ContractStatus] : null

  return (
    <>
      <nav className="nav"><Link href="/"><NavLogo /></Link></nav>
      <div className="page" style={{ maxWidth: 560 }}>
        <h1 className="section-title">Гэрээ шалгах · 协议验证</h1>
        {!c || !info ? (
          <div className="card" style={{ padding: '1.25rem', borderColor: 'var(--danger)' }}>
            <b style={{ color: 'var(--danger)' }}>{no} дугаартай хүчинтэй гэрээ олдсонгүй.</b>
            <p style={{ fontSize: '0.84rem', color: 'var(--muted)', margin: '0.4rem 0 0' }}>未找到该编号的有效协议。</p>
          </div>
        ) : (
          <div className="card" style={{ padding: '1.25rem', borderColor: info.color }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: info.color }}>{info.label}</div>
            <dl style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr)', gap: '0.45rem 0.8rem', fontSize: '0.86rem', margin: '1rem 0 0' }}>
              <dt style={dt}>Гэрээ № / 编号</dt><dd style={dd}>{c.contractNo}</dd>
              <dt style={dt}>А тал / 甲方</dt><dd style={dd}>{c.warehouse.legalNameMn ?? c.warehouse.name}<br /><span style={{ color: 'var(--muted)' }}>{c.warehouse.legalNameCn}</span></dd>
              <dt style={dt}>Б тал / 乙方</dt><dd style={dd}>{safeValues(c.values).cargoLegalName}</dd>
              <dt style={dt}>Байгуулсан / 签订</dt><dd style={dd}>{c.cargoSignedAt && formatDateTime(c.cargoSignedAt)}</dd>
              <dt style={dt}>Хүчин төгөлдөр / 生效</dt><dd style={dd}>{c.approvedAt && formatDateTime(c.approvedAt)}</dd>
              {c.status === 'TERMINATION_PENDING' && c.terminationEffectiveAt && (
                <><dt style={dt}>Цуцлагдах / 解除</dt><dd style={dd}>{formatDateTime(c.terminationEffectiveAt)}</dd></>
              )}
              {c.terminatedAt && <><dt style={dt}>Цуцлагдсан / 已解除</dt><dd style={dd}>{formatDateTime(c.terminatedAt)}</dd></>}
              <dt style={dt}>SHA-256</dt><dd style={{ ...dd, fontFamily: 'ui-monospace, monospace', fontSize: '0.72rem', overflowWrap: 'anywhere' }}>{c.bodyHash}</dd>
            </dl>
            <p style={{ fontSize: '0.76rem', color: 'var(--muted)', margin: '1rem 0 0', lineHeight: 1.55 }}>
              PDF дээрх SHA-256 код дээрхтэй яг ижил бол гэрээний агуулга өөрчлөгдөөгүй.
              <br />若PDF上的SHA-256校验码与上方一致，则协议内容未被篡改。
            </p>
          </div>
        )}
      </div>
    </>
  )
}

const dt: React.CSSProperties = { color: 'var(--muted)', margin: 0 }
const dd: React.CSSProperties = { margin: 0, fontWeight: 600 }
