// Эрээний агуулахын цахим гэрээ — client болон server хоёуланд ашиглах цэвэр логик (DB-гүй)

export type ClauseKind = 'text' | 'heading' | 'clause'

export interface Clause {
  kind: ClauseKind
  no?: string
  mn: string
  cn: string
}

export interface ContractBody {
  titleMn: string
  titleCn: string
  clauses: Clause[]
}

// ── Бөглөх талбарууд (Б тал) ──

export interface CargoField {
  key: string
  label: string
  placeholder?: string
  max: number
}

export const CARGO_FIELDS: CargoField[] = [
  { key: 'cargoLegalName', label: 'Байгууллагын нэр', placeholder: 'Их Хүслэн карго ХХК', max: 120 },
  { key: 'cargoRegisterNo', label: 'Регистрийн дугаар', placeholder: '1234567', max: 20 },
  { key: 'repLastName', label: 'Төлөөлөгчийн овог', placeholder: 'Батын', max: 60 },
  { key: 'repFirstName', label: 'Төлөөлөгчийн нэр', placeholder: 'Болд', max: 60 },
  { key: 'repPosition', label: 'Албан тушаал', placeholder: 'Захирал', max: 60 },
  { key: 'repPhone', label: 'Утас', placeholder: '99112233', max: 30 },
  { key: 'cargoDistrict', label: 'Дүүрэг', placeholder: 'Баянзүрх', max: 40 },
  { key: 'cargoKhoroo', label: 'Хороо', placeholder: '5', max: 20 },
  { key: 'cargoAddress', label: 'Хаяг (гудамж, байр, тоот)', placeholder: '12-р байр, 34 тоот', max: 160 },
  { key: 'destination', label: 'Хүргэх хот / аймаг', placeholder: 'Улаанбаатар хот', max: 80 },
  { key: 'ubUnloadAddress', label: 'Ачаа буух хаяг', placeholder: 'Баянзүрх дүүрэг, ... ачаа тээш буух цэг', max: 200 },
]

export const CARGO_FIELD_KEYS = CARGO_FIELDS.map(f => f.key)

export type CargoValues = Record<string, string>

export function sanitizeValues(input: unknown): CargoValues {
  const out: CargoValues = {}
  if (!input || typeof input !== 'object') return out
  for (const f of CARGO_FIELDS) {
    const v = (input as Record<string, unknown>)[f.key]
    if (typeof v === 'string') out[f.key] = v.replace(/\s+/g, ' ').trim().slice(0, f.max)
  }
  return out
}

export function missingFields(values: CargoValues): CargoField[] {
  return CARGO_FIELDS.filter(f => !values[f.key]?.trim())
}

// ── Системээс бөглөгдөх талбарууд ──

export const SYSTEM_PLACEHOLDERS: Record<string, string> = {
  contractNo: 'Гэрээний дугаар',
  signDate: 'Байгуулсан огноо',
  whLegalNameMn: 'Агуулахын нэр (МН)',
  whLegalNameCn: 'Агуулахын нэр (中文)',
  whRegisterNo: 'Агуулахын регистр',
  whDirector: 'Агуулахын захирал',
  whAddress: 'Агуулахын хаяг',
  contractFee: 'Гэрээний төлбөр',
  contractFeeWordsMn: 'Төлбөр үсгээр (МН)',
  contractFeeWordsCn: 'Төлбөр үсгээр (中文)',
  bankName: 'Банк',
  bankAccount: 'Данс',
  bankHolder: 'Данс эзэмшигч',
  pricePerTonCny: '1 тонны үнэ (юань)',
  pricePerM3Cny: '1 м³ үнэ (юань)',
  pricePerKgMnt: '1 кг үнэ (төгрөг)',
  noticeDays: 'Цуцлах мэдэгдлийн хоног',
}

export const ALL_PLACEHOLDERS: Record<string, string> = {
  ...SYSTEM_PLACEHOLDERS,
  ...Object.fromEntries(CARGO_FIELDS.map(f => [f.key, f.label])),
}

const PH_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function extractPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(PH_RE)].map(m => m[1]))].sort()
}

export const BLANK = '__________'

export function renderText(text: string, vars: Record<string, string>): string {
  return text.replace(PH_RE, (_, k: string) => vars[k]?.trim() || BLANK)
}

export function renderBody(body: ContractBody, vars: Record<string, string>): ContractBody {
  return {
    titleMn: renderText(body.titleMn, vars),
    titleCn: renderText(body.titleCn, vars),
    clauses: body.clauses.map(c => ({ ...c, mn: renderText(c.mn, vars), cn: renderText(c.cn, vars) })),
  }
}

export function parseBody(json: string): ContractBody {
  const b = JSON.parse(json) as ContractBody
  return { titleMn: b.titleMn ?? '', titleCn: b.titleCn ?? '', clauses: Array.isArray(b.clauses) ? b.clauses : [] }
}

// whLegalNameMn ↔ whLegalNameCn зэрэг хэл тус бүрийн хувилбартай талбарыг нэг гэж тооцно
const LANG_PAIRS = new Set(['whLegalName', 'contractFeeWords'])
function pairKeys(keys: string[]): string {
  return [...new Set(keys.map(k => {
    const base = k.replace(/(Mn|Cn)$/, '')
    return LANG_PAIRS.has(base) ? base : k
  }))].sort().join()
}

// Загвар хадгалахын өмнөх шалгалт: хоёр хэл заавал, placeholder хоёр хэлэнд ижил, мэдэгдэх нэртэй
export function validateTemplate(body: ContractBody): string | null {
  if (!body.titleMn?.trim() || !body.titleCn?.trim()) return 'Гарчиг монгол, хятад хоёулаа бөглөгдсөн байх ёстой'
  if (!body.clauses.length) return 'Гэрээнд дор хаяж нэг заалт байх ёстой'
  if (body.clauses.length > 200) return 'Заалт хэт олон байна'
  for (const [i, c] of body.clauses.entries()) {
    const where = c.no ? `${c.no}-р заалт` : `${i + 1}-р мөр`
    if (!['text', 'heading', 'clause'].includes(c.kind)) return `${where}: төрөл буруу`
    if (!c.mn?.trim()) return `${where}: монгол текст хоосон байна`
    if (!c.cn?.trim()) return `${where}: хятад орчуулга хоосон байна`
    if (c.mn.length > 4000 || c.cn.length > 4000) return `${where}: текст хэт урт байна`
    const a = extractPlaceholders(c.mn)
    const b = extractPlaceholders(c.cn)
    const unknown = [...a, ...b].find(k => !(k in ALL_PLACEHOLDERS))
    if (unknown) return `${where}: {{${unknown}}} гэсэн талбар байхгүй`
    if (pairKeys(a) !== pairKeys(b)) return `${where}: монгол, хятад мөрний талбарууд таарахгүй байна`
  }
  return null
}

// ── Төлөв ──

export type ContractStatus =
  | 'DRAFT' | 'AWAITING_PAYMENT' | 'PAYMENT_REVIEW' | 'ACTIVE'
  | 'TERMINATION_PENDING' | 'TERMINATED' | 'REJECTED'

export const STATUS_INFO: Record<ContractStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Ноорог', color: '#78716c' },
  AWAITING_PAYMENT: { label: 'Төлбөр хүлээгдэж байна', color: '#d97706' },
  PAYMENT_REVIEW: { label: 'Төлбөр шалгаж байна', color: '#2563eb' },
  ACTIVE: { label: 'Хүчинтэй', color: '#16a34a' },
  TERMINATION_PENDING: { label: 'Цуцлагдаж байна', color: '#ea580c' },
  TERMINATED: { label: 'Цуцлагдсан', color: '#6b7280' },
  REJECTED: { label: 'Татгалзсан', color: '#dc2626' },
}

// PDF татаж болох төлвүүд — super admin баталсны дараа л
export const PDF_STATUSES: ContractStatus[] = ['ACTIVE', 'TERMINATION_PENDING', 'TERMINATED']

export const TERMINATION_NOTICE_DAYS = 30
// Гэрээ байгуулсан каргод вэбсайтыг үнэгүй ашиглуулах хоног (гэрээний 3.5-р заалт)
export const WEBSITE_BONUS_DAYS = 60
export const PAYMENT_WAIT_DAYS = 30

export const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Ноорог үүсгэсэн',
  SIGNED: 'Карго цахимаар баталгаажуулсан',
  PAYMENT_CLAIMED: 'Карго төлбөр төлснөө мэдэгдсэн',
  APPROVED: 'Төлбөр баталгаажиж, гэрээ хүчин төгөлдөр болсон',
  REJECTED: 'Татгалзсан',
  TERMINATION_REQUESTED: 'Цуцлах мэдэгдэл өгсөн',
  TERMINATION_CANCELLED: 'Цуцлах мэдэгдлийг буцаасан',
  TERMINATED: 'Гэрээ цуцлагдсан',
  EXPIRED_UNPAID: 'Төлбөр хугацаандаа ороогүй тул хаагдсан',
  WEBSITE_BONUS: 'Вэбсайт 60 хоног үнэгүй олгосон',
  LINKED_TO_CARGO: 'Шинээр нээсэн каргод холбогдсон',
}

// ── Огноо, мөнгө ──

export function formatContractDate(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d)
  const get = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${get('year')} оны ${Number(get('month'))}-р сарын ${Number(get('day'))}-ний өдөр`
}

export function formatDateTime(d: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(d)).replace(',', '')
}

export function formatAmount(v: number | string): string {
  return Math.round(Number(v)).toLocaleString('en-US')
}

const MN_ONES = ['', 'нэг', 'хоёр', 'гурван', 'дөрвөн', 'таван', 'зургаан', 'долоон', 'найман', 'есөн']
const MN_TENS = ['', 'арван', 'хорин', 'гучин', 'дөчин', 'тавин', 'жаран', 'далан', 'наян', 'ерэн']
const MN_SCALES: [number, string, string][] = [
  [1e9, 'тэрбум', 'тэрбум'],
  [1e6, 'сая', 'сая'],
  [1e3, 'мянга', 'мянган'],
]

function mnBelowThousand(n: number): string[] {
  const words: string[] = []
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const o = n % 10
  if (h) words.push(MN_ONES[h], 'зуун')
  if (t) words.push(MN_TENS[t])
  if (o) words.push(MN_ONES[o])
  return words
}

// Мөнгөн дүнг "төгрөг" үгийн өмнө орох хэлбэрээр: 1200000 → "нэг сая хоёр зуун мянган"
export function mnMoneyWords(value: number): string {
  let n = Math.floor(Math.abs(value))
  if (n === 0) return 'тэг'
  const words: string[] = []
  for (const [size, plain, attributive] of MN_SCALES) {
    const q = Math.floor(n / size)
    if (!q) continue
    n %= size
    words.push(...mnBelowThousand(q), n ? plain : attributive)
  }
  words.push(...mnBelowThousand(n))
  return words.join(' ')
}

const CN_DIGITS = '零壹贰叁肆伍陆柒捌玖'
const CN_UNITS = ['', '拾', '佰', '仟']

function cnGroup(n: number): string {
  let s = ''
  let zero = false
  for (let i = 3; i >= 0; i--) {
    const d = Math.floor(n / 10 ** i) % 10
    if (d === 0) { if (s) zero = true; continue }
    if (zero) { s += '零'; zero = false }
    s += CN_DIGITS[d] + CN_UNITS[i]
  }
  return s
}

// 1200000 → "壹佰贰拾万"
export function cnMoneyWords(value: number): string {
  let n = Math.floor(Math.abs(value))
  if (n === 0) return '零'
  const groups: number[] = []
  while (n > 0) { groups.push(n % 10000); n = Math.floor(n / 10000) }
  const big = ['', '万', '亿']
  let s = ''
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g === 0) { if (s && !s.endsWith('零')) s += '零'; continue }
    if (s && g < 1000 && !s.endsWith('零')) s += '零'
    s += cnGroup(g) + big[i]
  }
  return s.replace(/零+$/, '')
}

// ── Анхдагч загвар ──
// Агуулахын "Ачаа тээвэрлэлт түншлэлийн гэрээ" draft дээр үндэслэсэн; шийдвэрлэсэн нөхцөлүүдийг
// (нэг удаагийн буцаагдахгүй төлбөр, хугацаагүй, барьцаагүй, цахим, хоёр хэл) тусгасан.
// Хятад орчуулгыг агуулах талаар батлуулна.

export const DEFAULT_TEMPLATE: ContractBody = {
  titleMn: 'АЧАА ТЭЭВЭРЛЭЛТ ТҮНШЛЭЛИЙН ГЭРЭЭ',
  titleCn: '货物运输合作协议',
  clauses: [
    {
      kind: 'text',
      mn: 'Энэхүү Түншлэлийн гэрээ (цаашид "Гэрээ" гэх)-г Иргэний хууль болон бусад хууль тогтоомжийг үндэслэн, нэг талаас БНХАУ, Шилийн гол аймаг, Эрээн хот, {{whAddress}} хаягт байрлах {{whLegalNameMn}} (РД: {{whRegisterNo}}, цаашид "А тал" гэх), түүнийг төлөөлж захирал {{whDirector}}, нөгөө талаас Улаанбаатар хот, {{cargoDistrict}} дүүрэг, {{cargoKhoroo}}-р хороо, {{cargoAddress}} хаягт орших "{{cargoLegalName}}" (регистр №: {{cargoRegisterNo}}, цаашид "Б тал" гэх), түүнийг төлөөлж {{repLastName}} овогтой {{repFirstName}} (цаашид хамтад нь "Талууд" гэх) нар харилцан тохиролцож, цахим хэлбэрээр дараах нөхцөлтэйгөөр байгуулав.',
      cn: '本合作协议（以下简称"本协议"）依据《民法》及其他相关法律法规，由位于中华人民共和国锡林郭勒盟二连浩特市{{whAddress}}的{{whLegalNameCn}}（统一社会信用代码：{{whRegisterNo}}，以下简称"甲方"，法定代表人：{{whDirector}}）与位于乌兰巴托市{{cargoDistrict}}区第{{cargoKhoroo}}委员会{{cargoAddress}}的"{{cargoLegalName}}"（注册号：{{cargoRegisterNo}}，以下简称"乙方"，代表人：{{repLastName}} {{repFirstName}}）（以下合称"双方"）经协商一致，以电子形式按以下条款订立。',
    },
    { kind: 'heading', mn: 'Нэг. Ерөнхий зүйл', cn: '第一条 总则' },
    {
      kind: 'clause', no: '1.1',
      mn: 'Гэрээний зүйл: Нэг газраас нөгөө газарт ачаа тээвэрлэлт хийхийг "Карго" гэнэ. Гэрээний дагуу А тал нь А талын хаягт ирсэн Б талын ачаа барааг БНХАУ-ын Эрээн хотоос Монгол Улсын Улаанбаатар хотын {{ubUnloadAddress}} хүртэл тээвэрлэн хүргэх үйлчилгээ үзүүлнэ. Монгол Улсын хууль, дүрэм, журам, норм, бусад стандарт, нөхцөлд нийцүүлэн гүйцэтгэх бөгөөд А талд төлбөр төлөхтэй холбоотой Талуудын хооронд үүсэх харилцааг зохицуулна.',
      cn: '协议标的：将货物从一地运往另一地称为"货运"。根据本协议，甲方负责将寄至甲方地址的乙方货物从中华人民共和国二连浩特市运送至蒙古国乌兰巴托市{{ubUnloadAddress}}。双方应遵守蒙古国法律、法规、规章、规范及其他标准和条件履行本协议，本协议调整双方之间因向甲方付款而产生的关系。',
    },
    {
      kind: 'clause', no: '1.2',
      mn: 'Ажил гүйцэтгэх газар: БНХАУ, Шилийн гол аймаг, Эрээн хотоос Монгол Улс, {{destination}} хүртэл.',
      cn: '履行地点：自中华人民共和国锡林郭勒盟二连浩特市至蒙古国{{destination}}。',
    },
    {
      kind: 'clause', no: '1.3',
      mn: 'А тал нь Эрээн хот дахь агуулахдаа Б талд зориулсан зай талбай гаргаж өгч, Б талын ачааг хүлээн авах, ангилах, баглаж савлах ажлыг гүйцэтгэнэ.',
      cn: '甲方在其二连浩特仓库内为乙方提供专用场地，并负责乙方货物的接收、分拣及打包工作。',
    },
    { kind: 'heading', mn: 'Хоёр. Үнэ, төлбөрийн нөхцөл', cn: '第二条 价格及付款条件' },
    { kind: 'clause', no: '2.1', mn: 'Овор ихтэй, жин багатай ачааг м³-ээр тооцож бодно.', cn: '体积大、重量轻的货物按立方米计费。' },
    { kind: 'clause', no: '2.2', mn: 'Жин ихтэй, овор багатай ачааг тонн жингээр бодно.', cn: '重量大、体积小的货物按吨计费。' },
    { kind: 'clause', no: '2.3', mn: 'Нэг тонн ачааг их багаас хамаарч {{pricePerTonCny}} юанаар тооцно.', cn: '每吨货物视数量多少按人民币{{pricePerTonCny}}元计费。' },
    { kind: 'clause', no: '2.4', mn: 'Нэг кг ачааны үнэ {{pricePerKgMnt}} төгрөг байна.', cn: '每公斤货物价格为{{pricePerKgMnt}}图格里克。' },
    {
      kind: 'clause', no: '2.5',
      mn: 'Нэг м³ ачааг {{pricePerM3Cny}} юанаар тооцож, тухайн өдрийн Alipay-ийн ханшаар төгрөгт хөрвүүлнэ.',
      cn: '每立方米货物按人民币{{pricePerM3Cny}}元计费，并按当日支付宝汇率折算为图格里克。',
    },
    {
      kind: 'clause', no: '2.6',
      mn: 'БНХАУ болон Монгол Улсын татварын хууль тогтоомж, гаалийн татварын үнэд өөрчлөлт орсон тохиолдолд тухай бүр ачилтын үнийг Талууд харилцан тохиролцож шийдвэрлэнэ.',
      cn: '如中华人民共和国或蒙古国的税收法律法规或关税发生变化，运费由双方另行协商确定。',
    },
    {
      kind: 'clause', no: '2.7',
      mn: 'Б тал нь Гэрээ байгуулахдаа А талын {{bankName}} дахь {{bankAccount}} тоот ({{bankHolder}}) дансанд нэг удаагийн {{contractFee}} ({{contractFeeWordsMn}}) төгрөгийн гэрээний төлбөр төлнө. Гүйлгээний утгад гэрээний дугаар {{contractNo}}-г бичнэ.',
      cn: '乙方签订本协议时，应向甲方{{bankName}}账户{{bankAccount}}（户名：{{bankHolder}}）一次性支付合作费{{contractFee}}图格里克（{{contractFeeWordsCn}}图格里克）。转账备注请填写协议编号{{contractNo}}。',
    },
    {
      kind: 'clause', no: '2.8',
      mn: 'Гэрээний төлбөр нь нэг удаагийн бөгөөд жил бүр төлөгдөхгүй. Гэрээ аль ч талын санаачилгаар цуцлагдсан тохиолдолд уг төлбөрийг буцаан олгохгүй.',
      cn: '合作费为一次性费用，无需每年缴纳。无论本协议由哪一方提出解除，该费用均不予退还。',
    },
    { kind: 'heading', mn: 'Гурав. А талын эрх, үүрэг', cn: '第三条 甲方的权利和义务' },
    { kind: 'clause', no: '3.1', mn: 'Жижиг ачааг Эрээн хотын салбар объект дээр хүлээн авч, ялган ангилж, баглаж шуудайлна.', cn: '在二连浩特分点接收小件货物，并进行分拣、打包、装袋。' },
    { kind: 'clause', no: '3.2', mn: 'Том ачааг Гаалийн хашааны ачилтын агуулахад хаяг заан буулгаж, тэмдэглэгээ наана.', cn: '大件货物按地址卸至海关院内装车仓库，并粘贴标识。' },
    { kind: 'clause', no: '3.3', mn: 'Баглаж савласан жижиг ачааг тэмдэглэгээ хийж, өөрийн тээврийн хэрэгслээр үнэ төлбөргүй зөөвөрлөн Гаалийн хашаанд хүргэнэ.', cn: '已打包的小件货物做好标识后，由甲方自有车辆免费运送至海关院内。' },
    { kind: 'clause', no: '3.4', mn: 'Гэрээний 2 дугаар зүйлд заасан журмаар Б талаас төлбөрөө шаардан авна.', cn: '按照本协议第二条的规定向乙方收取费用。' },
    { kind: 'clause', no: '3.5', mn: 'Түншлэлийн гэрээ байгуулснаар Б талд вэбсайтыг үнэ төлбөргүй хийж өгөх бөгөөд карго хэрхэн ажиллуулах онлайн сургалтад хамруулна.', cn: '签订本合作协议后，甲方免费为乙方制作网站，并为乙方提供货运经营线上培训。' },
    { kind: 'heading', mn: 'Дөрөв. Б талын эрх, үүрэг', cn: '第四条 乙方的权利和义务' },
    { kind: 'clause', no: '4.1', mn: 'Өөрийн тодорхой бүсчилсэн газартаа маркетинг, зар сурталчилгаа хийж, хэрэглэгчээ татах ажлыг хариуцан ажиллана.', cn: '负责在其指定区域内开展市场营销及广告宣传，招揽客户。' },
    { kind: 'clause', no: '4.2', mn: 'Харилцагч нартаа сургалт, зөвлөгөө өгч, "Хаяг холболт" хийж ажиллана.', cn: '为客户提供培训和咨询，并办理"地址绑定"。' },
    { kind: 'clause', no: '4.3', mn: 'Ачааны үнэ тариф, стандартаа Б тал өөрөө тогтооно.', cn: '货物运价及标准由乙方自行制定。' },
    { kind: 'clause', no: '4.4', mn: 'Улаанбаатар хотын {{ubUnloadAddress}} хаягт буух ачаа барааг тухай бүрт нь цаг алдалгүй, тоо ёсоор бүрэн хүлээн авна.', cn: '按时、按数量完整接收卸至乌兰巴托市{{ubUnloadAddress}}的货物。' },
    { kind: 'clause', no: '4.5', mn: 'Б тал нь харилцагчийнхаа гомдол, саналыг өөрийн чиг үүргийн дагуу шийдвэрлэнэ.', cn: '乙方应按照其职责处理客户的投诉和建议。' },
    { kind: 'clause', no: '4.6', mn: 'Эрээн хотоос хэмжилт хийж илгээсэн тооцооны дагуу үнийн дүнг ачилт хийгдсэн даруйд тухайн өдрийн Alipay-ийн ханшаар тооцож дуусгана.', cn: '根据二连浩特测量后发送的结算单，装车后立即按当日支付宝汇率结清运费。' },
    { kind: 'clause', no: '4.7', mn: 'А тал нь албан ёсны, даатгалтай Хятад компани тул тээвэрлэлт баталгаатай байна.', cn: '甲方为正规且已投保的中国公司，运输有保障。' },
    { kind: 'heading', mn: 'Тав. Давагдашгүй хүчин зүйл, түүний улмаас үүсэх эрсдлийг хуваарилах', cn: '第五条 不可抗力及风险分担' },
    { kind: 'clause', no: '5.1', mn: 'Давагдашгүй хүчин зүйлд дайн, иргэний бослого, түймэр, үер, халдварт өвчин, газар хөдлөлт, хорио цээр, тээврийн хориг болон бусад гэнэтийн болон давагдашгүй хүчний нөхцөл байдлыг тооцно.', cn: '不可抗力包括战争、内乱、火灾、洪水、传染病、地震、检疫隔离、运输禁令及其他突发且不可抗拒的情况。' },
    { kind: 'clause', no: '5.2', mn: 'Давагдашгүй хүчин зүйлийн нөлөөнд өртсөн Тал нь нөгөө Талд нэн даруй мэдэгдэх бөгөөд тухайн хүчин зүйлийн нөлөөнд өртөөгүй өөрийн үүрэгт хамаарах үйл ажиллагааг үргэлжлүүлэн гүйцэтгэж, Гэрээний хэрэгжилтэд гарсан саатлыг аль болох богино хугацаанд арилгах, үйл ажиллагааг сэргээх талаар шаардлагатай бүхий л арга хэмжээг авч ажиллана.', cn: '受不可抗力影响的一方应立即通知另一方，继续履行未受影响的义务，并采取一切必要措施尽快消除对本协议履行造成的延误、恢复正常经营。' },
    { kind: 'clause', no: '5.3', mn: 'Давагдашгүй хүчин зүйлийн улмаас Гэрээний хэрэгжилт нэг (1)-ээс дээш сарын хугацаагаар бүхэлдээ буюу хэсэгчлэн саатсан тохиолдолд аль нэг тал нь нөгөө талдаа Гэрээг дуусгавар болгох тухай хүсэлтээ бичгээр мэдэгдэж, харилцан тохиролцож шийдвэрлэнэ.', cn: '因不可抗力导致本协议全部或部分履行延误超过一（1）个月的，任何一方均可书面通知另一方要求终止本协议，并由双方协商解决。' },
    { kind: 'heading', mn: 'Зургаа. Гэрээ цуцлах', cn: '第六条 协议的解除' },
    { kind: 'clause', no: '6.1', mn: 'Б тал энэхүү Гэрээний үүргээ зохих ёсоор, хугацаанд нь шударгаар биелүүлээгүй тохиолдолд А тал нэмэлт хугацаа тогтоож, үүргээ биелүүлэхийг Б талаас шаардах эрхтэй. Үүргээ биелүүлээгүй бол А тал Гэрээнээс татгалзаж, учирсан хохирол, зардлыг Б талаар нөхөн төлүүлэх эрхтэй.', cn: '乙方未按时、诚信、适当履行本协议义务的，甲方有权规定补充期限要求乙方履行；逾期仍未履行的，甲方有权解除本协议，并要求乙方赔偿由此造成的损失和费用。' },
    { kind: 'clause', no: '6.2', mn: 'А тал нь өөрийн санаачилгаар {{noticeDays}} хоногийн өмнө мэдэгдэл өгөх замаар хэдийд ч Гэрээг цуцалж болох бөгөөд энэ тохиолдолд мэдэгдэл өгөхөөс өмнө гүйцэтгэсэн ажлын хөлсийг Талууд тооцож барагдуулна.', cn: '甲方可随时提前{{noticeDays}}天通知解除本协议，在此情况下，双方应结清通知前已完成工作的费用。' },
    { kind: 'clause', no: '6.3', mn: 'Б тал нь мөн өөрийн санаачилгаар {{noticeDays}} хоногийн өмнө мэдэгдэл өгөх замаар хэдийд ч Гэрээг цуцалж болох бөгөөд Талууд харилцан тохиролцон хоорондын төлбөр тооцоог дуусгах үүрэгтэй.', cn: '乙方亦可随时提前{{noticeDays}}天通知解除本协议，双方应协商结清相互间的款项。' },
    { kind: 'clause', no: '6.4', mn: 'Гэрээ цуцлагдсан тохиолдолд Гэрээний 2.7-д заасан гэрээний төлбөрийг буцаан олгохгүй.', cn: '本协议解除后，第2.7条所述合作费不予退还。' },
    { kind: 'heading', mn: 'Долоо. Бусад зүйл', cn: '第七条 其他' },
    { kind: 'clause', no: '7.1', mn: 'Гэрээ хүчин төгөлдөр болох: Б тал Гэрээг цахимаар баталгаажуулж, А тал гэрээний төлбөрийг хүлээн авснаа баталснаар Гэрээ хүчин төгөлдөр болно. Цахимаар баталгаажуулсан Гэрээ нь гарын үсэг зурж, тамга дарсан Гэрээтэй адил хүчинтэй.', cn: '协议生效：乙方以电子方式确认本协议，且甲方确认收到合作费后，本协议生效。经电子确认的协议与签字盖章的协议具有同等效力。' },
    { kind: 'clause', no: '7.2', mn: 'Гэрээний хугацаа: Гэрээ хугацаагүй бөгөөд Гэрээний 6 дугаар зүйлд заасны дагуу цуцлах хүртэл хүчинтэй байна.', cn: '协议期限：本协议无固定期限，在依照第六条解除之前持续有效。' },
    { kind: 'clause', no: '7.3', mn: 'Нэмэлт, өөрчлөлт: Гэрээнд нэмэлт, өөрчлөлт оруулах асуудлыг Талууд харилцан тохиролцож, нэмэлт гэрээ байгуулсны үндсэн дээр шийдвэрлэнэ.', cn: '变更与补充：本协议的变更与补充由双方协商一致，并以签订补充协议的方式确定。' },
    { kind: 'clause', no: '7.4', mn: 'Санал, хүсэлт: Гэрээнд нэмэлт, өөрчлөлт оруулах санал, Гэрээг дуусгавар болгох, цуцлах тухай мэдэгдэл болон Гэрээтэй холбогдон нэг талаас нөгөө талдаа гаргаж буй аливаа санал, мэдэгдэл, хүсэлтийг бичгээр (цахим хэлбэрээр) үйлдэж, 3-аас доошгүй хоногийн өмнө нөгөө талдаа хүргүүлснийг хүчинтэйд тооцно.', cn: '通知与请求：任何一方就本协议向另一方提出的变更建议、终止或解除通知及其他建议、通知、请求，均应以书面（含电子）形式作出，并至少提前3天送达另一方方为有效。' },
    { kind: 'clause', no: '7.5', mn: 'Гэрээний хэл: Гэрээ монгол, хятад хэлээр үйлдэгдсэн бөгөөд хоёр хэлний агуулгад зөрүү гарвал монгол хэл дээрх агуулгыг баримтална.', cn: '协议语言：本协议以蒙古文和中文书就，两种文本如有不一致，以蒙古文文本为准。' },
    { kind: 'clause', no: '7.6', mn: 'Гэрээний хувь: Гэрээ цахим хэлбэрээр үйлдэгдэх бөгөөд Талууд Гэрээний PDF хувийг системээс татаж авна. Татаж авсан хувь нь хууль зүйн хувьд адил хүчинтэй.', cn: '协议文本：本协议以电子形式订立，双方可从系统下载本协议的PDF文本，所下载文本具有同等法律效力。' },
  ],
}
