// Каргогийн Эрээний хаягууд — үндсэн хаяг (ereemReceiver…ereemAddress) + нэмэлт хаягууд (ereemAddresses).
// Жишээ: "Жижиглэн ачаа", "Бөөн ачаа" — хэрэглэгч ачааныхаа төрлөөр хаягаа сонгоно.
// Нэг хаягтай карго урьдын адил харагдана. Client болон server хоёуланд ашиглана.

export interface EreenAddress {
  name: string
  receiver: string
  phone: string
  region: string
  address: string
}

// Нийт хаягийн дээд тоо (үндсэн + нэмэлт)
export const MAX_EREEN_ADDRESSES = 3

const MAX_LEN = { name: 40, receiver: 60, phone: 30, region: 120, address: 200 } as const

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

// Нэмэлт хаягуудыг шалгаж цэвэрлэнэ — нэр, хүлээн авагч, хаяг бүгд бөглөгдсөн байх ёстой
export function sanitizeExtraAddresses(input: unknown): { value: EreenAddress[]; error: string | null } {
  if (input == null) return { value: [], error: null }
  if (!Array.isArray(input)) return { value: [], error: 'Хаягийн мэдээлэл буруу байна' }
  const list: EreenAddress[] = input.slice(0, MAX_EREEN_ADDRESSES - 1).map((a: Record<string, unknown>) => ({
    name: clean(a?.name, MAX_LEN.name),
    receiver: clean(a?.receiver, MAX_LEN.receiver),
    phone: clean(a?.phone, MAX_LEN.phone),
    region: clean(a?.region, MAX_LEN.region),
    address: clean(a?.address, MAX_LEN.address),
  }))
  for (const [i, a] of list.entries()) {
    if (!a.name || !a.receiver || !a.address) {
      return { value: [], error: `Хаяг ${i + 2}: нэр, хүлээн авагч, дэлгэрэнгүй хаягаа бөглөнө үү` }
    }
  }
  return { value: list, error: null }
}

export function parseExtraAddresses(json: unknown): EreenAddress[] {
  return sanitizeExtraAddresses(json).value
}

// Хэрэглэгчид харуулах бүх хаяг. Нэмэлт хаяг байхгүй бол үндсэн хаягийн нэр хэрэггүй
export function cargoAddresses(cargo: {
  ereemTitle?: string | null
  ereemReceiver: string; ereemPhone: string; ereemRegion?: string | null; ereemAddress: string
  ereemAddresses?: unknown
}): EreenAddress[] {
  const extra = parseExtraAddresses(cargo.ereemAddresses)
  const main: EreenAddress = {
    name: cargo.ereemTitle?.trim() || (extra.length ? 'Хаяг 1' : ''),
    receiver: cargo.ereemReceiver ?? '',
    phone: cargo.ereemPhone ?? '',
    region: cargo.ereemRegion ?? '',
    address: cargo.ereemAddress ?? '',
  }
  return [main, ...extra]
}

// AI туслах, мэдэгдэлд — бүх хаягийг нэрээр нь бичвэр болгоно
export function addressesText(list: EreenAddress[]): string {
  return list
    .filter(a => a.receiver || a.address)
    .map(a => [
      list.length > 1 && a.name ? `【${a.name}】` : null,
      a.receiver && `收货人: ${a.receiver}`,
      a.phone && `手机号: ${a.phone}`,
      a.region && `地区: ${a.region}`,
      a.address && `地址: ${a.address}`,
    ].filter(Boolean).join('\n'))
    .join('\n\n')
}
