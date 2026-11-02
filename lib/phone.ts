// Утасны дугаарыг нэг дүрмээр цэвэрлэнэ (client, server хоёулаа). "+976 9911-2233", "9911 2233",
// Excel-ийн тоон нүд "99112233.0" → "99112233". 8 оронтой биш бол null.
export function normalizePhone(raw: string) {
  return raw.replace(/\.0+$/, '').replace(/\D/g, '').replace(/^976(?=\d{8}$)/, '')
}

export function parsePhone(raw: unknown): string | null {
  const p = normalizePhone(String(raw ?? '').trim())
  return /^\d{8}$/.test(p) ? p : null
}
