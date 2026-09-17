import path from 'path'
import { Document, Page, Text, View, Font, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { ContractBody, formatContractDate, formatDateTime } from '@/lib/contract'

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts')

// Монгол мөр кирилл фонтоор, хятад мөр хятад фонтоор; нөгөө хэлний үсэг холилдвол fallback-аар гарна
Font.register({
  family: 'NotoSans',
  fonts: [
    { src: path.join(FONT_DIR, 'NotoSans-Regular.ttf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'NotoSans-Bold.ttf'), fontWeight: 700 },
  ],
})
Font.register({
  family: 'NotoSansSC',
  fonts: [
    { src: path.join(FONT_DIR, 'NotoSansSC-Regular.otf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'NotoSansSC-Bold.otf'), fontWeight: 700 },
  ],
})
// Кирилл үгийг таслахгүй (англи hyphenation буруу тасладаг). Хятад текст зайгүй тул тэмдэгт бүрийн
// хооронд таслах цэг өгнө — хоосон мөр нь "-" зураас нэмэхгүйгээр таслахыг зөвшөөрнө
const CJK_RE = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/
Font.registerHyphenationCallback(word => (CJK_RE.test(word) ? Array.from(word).flatMap(ch => [ch, '']) : [word]))

// react-pdf-ийн төрөлд fallback массив ороогүй ч runtime дэмждэг
const MN_FONT = ['NotoSans', 'NotoSansSC'] as unknown as string
const CN_FONT = ['NotoSansSC', 'NotoSans'] as unknown as string

const INK = '#1c1917'
const MUTED = '#57534e'
const LINE = '#d6d3d1'

const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 54, paddingHorizontal: 48, fontFamily: MN_FONT, fontSize: 9.6, color: INK, lineHeight: 1.5 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: MUTED, marginBottom: 14 },
  title: { fontSize: 15, fontWeight: 700, textAlign: 'center' },
  titleCn: { fontFamily: CN_FONT, fontSize: 13, fontWeight: 700, textAlign: 'center', color: MUTED, marginTop: 2 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, marginBottom: 10, paddingVertical: 6, borderTopWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE, fontSize: 8.6 },
  cn: { fontFamily: CN_FONT, color: MUTED, fontSize: 9, textAlign: 'left' },
  text: { textAlign: 'justify', marginBottom: 6 },
  heading: { marginTop: 10, marginBottom: 4, alignItems: 'center' },
  headingMn: { fontWeight: 700, fontSize: 10.6, textAlign: 'center' },
  headingCn: { fontFamily: CN_FONT, fontWeight: 700, fontSize: 9.6, color: MUTED, textAlign: 'center' },
  clause: { flexDirection: 'row', marginBottom: 5 },
  clauseNo: { width: 24, fontWeight: 700 },
  clauseBody: { flex: 1, textAlign: 'justify' },
  banner: { borderWidth: 1, borderColor: '#dc2626', color: '#dc2626', padding: 6, marginBottom: 10, textAlign: 'center', fontWeight: 700 },
  signWrap: { flexDirection: 'row', marginTop: 10, gap: 12 },
  signBox: { flex: 1, borderWidth: 0.8, borderColor: LINE, borderRadius: 4, padding: 10 },
  signHead: { fontWeight: 700, fontSize: 10, marginBottom: 6, paddingBottom: 4, borderBottomWidth: 0.6, borderColor: LINE },
  row: { flexDirection: 'row', marginBottom: 2.5, fontSize: 8.6 },
  rowLabel: { width: 104, color: MUTED },
  rowVal: { flex: 1 },
  stamp: { marginTop: 8, padding: 5, borderWidth: 0.8, borderColor: '#16a34a', borderRadius: 3, color: '#15803d', fontSize: 8.2 },
  verify: { marginTop: 8, padding: 7, backgroundColor: '#fafaf9', borderWidth: 0.6, borderColor: LINE, borderRadius: 4, fontSize: 8 },
  footerLeft: { position: 'absolute', bottom: 24, left: 48, fontSize: 7.4, color: MUTED },
})

export interface ContractPdfData {
  contractNo: string
  body: ContractBody
  bodyHash: string
  cargoSignedAt: Date
  cargoSignerName: string
  cargoSignerEmail: string | null
  cargoSignIp: string | null
  approvedAt: Date
  approvedByName: string
  paidAt: Date | null
  terminatedAt: Date | null
  terminationEffectiveAt: Date | null
  status: string
  cargo: { legalName: string; registerNo: string; repName: string; repPosition: string; repPhone: string }
  warehouse: { legalNameMn: string; legalNameCn: string; registerNo: string; director: string; address: string }
  verifyUrl: string
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowVal}>{value || '—'}</Text>
    </View>
  )
}

function ContractPdf({ d }: { d: ContractPdfData }) {
  const shortHash = d.bodyHash.slice(0, 16)
  return (
    <Document title={`${d.contractNo} — ${d.body.titleMn}`} author="Aicargo" subject={d.body.titleCn} creator="aicargo.mn">
      <Page size="A4" style={s.page} wrap>
        <View style={s.topBar} fixed>
          <Text>Гэрээ № / 协议编号: {d.contractNo}</Text>
          <Text>aicargo.mn</Text>
        </View>

        {d.status === 'TERMINATED' && d.terminatedAt && (
          <Text style={s.banner}>ЦУЦЛАГДСАН / 已解除 — {formatDateTime(d.terminatedAt)}</Text>
        )}
        {d.status === 'TERMINATION_PENDING' && d.terminationEffectiveAt && (
          <Text style={[s.banner, { borderColor: '#ea580c', color: '#ea580c' }]}>
            {formatDateTime(d.terminationEffectiveAt)}-нд цуцлагдана / 将于该日解除
          </Text>
        )}

        <Text style={s.title}>{d.body.titleMn}</Text>
        <Text style={s.titleCn}>{d.body.titleCn}</Text>

        <View style={s.meta}>
          <View>
            <Text>{formatContractDate(d.cargoSignedAt)}</Text>
            <Text style={s.cn}>签订日期：{formatDateTime(d.cargoSignedAt).slice(0, 10)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text>Цахим хэлбэрээр байгуулав</Text>
            <Text style={s.cn}>以电子形式订立</Text>
          </View>
        </View>

        {d.body.clauses.map((c, i) => {
          if (c.kind === 'heading') {
            return (
              <View key={i} style={s.heading} wrap={false}>
                <Text style={s.headingMn}>{c.mn}</Text>
                <Text style={s.headingCn}>{c.cn}</Text>
              </View>
            )
          }
          if (c.kind === 'clause') {
            return (
              <View key={i} style={s.clause} wrap={false}>
                <Text style={s.clauseNo}>{c.no}</Text>
                <View style={s.clauseBody}>
                  <Text>{c.mn}</Text>
                  <Text style={s.cn}>{c.cn}</Text>
                </View>
              </View>
            )
          }
          return (
            <View key={i} style={s.text}>
              <Text>{c.mn}</Text>
              <Text style={s.cn}>{c.cn}</Text>
            </View>
          )
        })}

        <View wrap={false}>
          <Text style={[s.headingMn, { marginTop: 12 }]}>Гэрээ байгуулсан</Text>
          <Text style={s.headingCn}>协议签署方</Text>
          <View style={s.signWrap}>
            <View style={s.signBox}>
              <Text style={s.signHead}>А тал / 甲方</Text>
              <Row label="Байгууллага" value={d.warehouse.legalNameMn} />
              <Row label="公司名称" value={d.warehouse.legalNameCn} />
              <Row label="Регистр / 代码" value={d.warehouse.registerNo} />
              <Row label="Захирал / 法人" value={d.warehouse.director} />
              <View style={s.stamp}>
                <Text style={{ fontWeight: 700 }}>Цахимаар баталсан / 已电子确认</Text>
                <Text>{formatDateTime(d.approvedAt)}</Text>
                <Text>А талыг төлөөлж: {d.approvedByName} (aicargo)</Text>
                {d.paidAt && <Text>Төлбөр хүлээн авсан / 已收款: {formatDateTime(d.paidAt)}</Text>}
              </View>
            </View>
            <View style={s.signBox}>
              <Text style={s.signHead}>Б тал / 乙方</Text>
              <Row label="Байгууллага" value={d.cargo.legalName} />
              <Row label="Регистр / 注册号" value={d.cargo.registerNo} />
              <Row label="Төлөөлөгч / 代表" value={d.cargo.repName} />
              <Row label="Тушаал / 职务" value={d.cargo.repPosition} />
              <Row label="Утас / 电话" value={d.cargo.repPhone} />
              <View style={s.stamp}>
                <Text style={{ fontWeight: 700 }}>Цахимаар баталгаажуулсан / 已电子签署</Text>
                <Text>{formatDateTime(d.cargoSignedAt)}</Text>
                <Text>{d.cargoSignerName}{d.cargoSignerEmail ? ` · ${d.cargoSignerEmail}` : ''}</Text>
                <Text>aicargo.mn вэбээр баталгаажсан / 网页确认{d.cargoSignIp ? ` · IP ${d.cargoSignIp}` : ''}</Text>
              </View>
            </View>
          </View>

        <View style={s.verify}>
            <Text>
              Энэхүү гэрээг aicargo.mn системээр цахимаар байгуулсан. Гэрээний агуулгын SHA-256 хяналтын код:
            </Text>
            <Text style={{ fontFamily: 'Courier', fontSize: 7.4, marginVertical: 2 }}>{d.bodyHash}</Text>
            <Text style={s.cn}>本协议通过aicargo.mn系统以电子方式订立，上方为协议内容的SHA-256校验码。</Text>
            <Text style={{ marginTop: 2 }}>Шалгах / 验证: {d.verifyUrl}</Text>
        </View>
        </View>

        <Text style={s.footerLeft} fixed>{d.contractNo} · SHA-256 {shortHash}…</Text>
      </Page>
    </Document>
  )
}

export function renderContractPdf(d: ContractPdfData): Promise<Buffer> {
  return renderToBuffer(<ContractPdf d={d} />)
}
