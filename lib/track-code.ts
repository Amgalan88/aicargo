// Трак кодыг нэг дүрмээр цэвэрлэнэ — Эрээн уншуулах, Ирсэн бүртгэх, Excel импорт, хэрэглэгчийн бүртгэл, багц.
// Client болон server хоёулаа ашиглана.
//
// Бодит алдаанаас гаргасан дүрмүүд:
//  - Сканнерын апп угтвар нэмдэг: "BAR CODE SCAN RESULT: JT55…", "ORDER NO.: 2609…"
//  - Монгол гарын байрлалаар бичигдсэн: "РЭ5532…" = J T (Р нь J, Э нь T товч дээр) → "JT5532…"
//  - QR кодын бүтэн текст: "MMM={'K1':…,'K5':'SF5141065336093',…}" → "SF5141065336093"
//  - "DPK365098423720*1" — ширхэгийн тоо → "DPK365098423720"
//  - Excel загварын тайлбар мөр ("* БАРААНЫ НЭР", "БУГУЙН ЦАГ") — трак код биш

// Монгол кирилл гарын товч → латин үсэг (ФЦУЖЭН… = QWERTY…)
const MN_KEYBOARD: Record<string, string> = {
  Ф: 'Q', Ц: 'W', У: 'E', Ж: 'R', Э: 'T', Н: 'Y', Г: 'U', Ш: 'I', Ү: 'O', З: 'P',
  Й: 'A', Ы: 'S', Б: 'D', Ө: 'F', А: 'G', Х: 'H', Р: 'J', О: 'K', Л: 'L',
  Я: 'Z', Ч: 'X', Ё: 'C', С: 'V', М: 'B', И: 'N', Т: 'M',
}
const CYRILLIC = /[А-ЯЁӨҮа-яёөү]/
const PREFIX = /^(?:bar\s*code\s*scan\s*result|scan\s*result|barcode|order\s*no\.?|order\s*number|tracking\s*(?:no\.?|number)?|waybill\s*(?:no\.?)?|运单号|快递单号|订单编号|订单号|单号)\s*[:：#]?\s*/i
// Түгээмэл шуудангийн угтвартай код (QR, урт текст дотроос хайхад)
const CARRIER = /\b(?:SF|JT|YT|ZTO|JD|YD|STO|DPK|TT|EMS|DB|AN|HT|YZ|KY)[0-9]{8,20}\b/i

export function cleanTrackCode(raw: unknown): string {
  let s = String(raw ?? '').trim()
  if (!s) return ''
  s = s.replace(PREFIX, '')
  // QR текст: 'K5':'SF…' эсвэл доторх шуудангийн код
  if (/[{}=]/.test(s)) {
    const k5 = s.match(/K5['"]?\s*[:=]\s*['"]?([A-Za-z0-9]{8,30})/)
    const carrier = s.match(CARRIER)
    if (k5) s = k5[1]
    else if (carrier) s = carrier[0]
  }
  s = s.replace(/\*\d+$/, '') // ширхэгийн тоо
  s = s.toUpperCase()
  // Монгол гараар бичсэн бол латин болгоно — зөвхөн кирилл үсэг + тоо холилдсон богино мөрөнд (үг өгүүлбэр биш)
  if (CYRILLIC.test(s) && /\d/.test(s) && !/\s/.test(s)) {
    s = s.replace(/[А-ЯЁӨҮ]/g, ch => MN_KEYBOARD[ch] ?? ch)
  }
  return s.replace(/\s+/g, '')
}

// Трак код мөн эсэх: латин үсэг, тоо, зураас; 6–40 тэмдэгт. Багц нь богино дугаар зөвшөөрдөг тул энийг ашиглахгүй
export function isTrackCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{5,39}$/.test(code) && /\d/.test(code)
}

// Сканнерын гацалт: "5#YT7646540047714" → шуудангийн код; "8260385958521 (4 адилхан хайрцаг)" → эхний үг
function salvage(raw: unknown): string | null {
  const s = String(raw ?? '').trim().replace(PREFIX, '').toUpperCase()
  const carrier = s.match(CARRIER)
  if (carrier && isTrackCode(carrier[0])) return carrier[0]
  const first = cleanTrackCode(s.split(/[\s(（]/)[0])
  return isTrackCode(first) ? first : null
}

// Цэвэрлээд шалгана: код эсвэл null (Эрээн, хэрэглэгчийн бүртгэл — заавал жинхэнэ ачааны код)
export function parseTrackCode(raw: unknown): string | null {
  const c = cleanTrackCode(raw)
  return isTrackCode(c) ? c : salvage(raw)
}

// "Ирсэн" бүртгэл — зарим карго төлбөр, барааг кодгүйгээр бичдэг ("АЧАА ЗАДЛАХ ТӨЛБӨР", "БУДАА"),
// тиймээс чөлөөт текстийг зөвшөөрнө; зөвхөн угтвар, Монгол гарын кодыг засаж, хэт урт заавар текстийг татгалзана
export function parseArrivedCode(raw: unknown): string | null {
  const strict = parseTrackCode(raw)
  if (strict) return strict
  const text = String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
  return text && text.length <= 60 ? text : null
}

// Pinduoduo, Taobao захиалгын дугаар (трак код биш) — хэрэглэгчид сануулахад
export function looksLikeOrderNumber(code: string): boolean {
  return /^\d{6}-\d{10,}$/.test(code) || /^\d{18,20}$/.test(code)
}
