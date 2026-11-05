import { createHash, timingSafeEqual } from 'crypto'

// Amgalan-ийн Cargo Supporter чатботын түлхүүр. Vercel төсөл `aicargo` дээр тохируулна.
// Хоосон эсвэл тохируулаагүй түлхүүр хэзээ ч таарахгүй.
export const BOT_API_KEY_ENV = 'BOT_API_KEY'

const MAX_TOKEN_LENGTH = 256

// Урт өөр байсан ч timingSafeEqual унахгүй, харьцуулалтын хугацаа нууцын уртаас хамаарахгүй.
export function bearerMatches(authorization: string | null | undefined, expected: string | undefined): boolean {
  if (!expected) return false
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')
  if (!match) return false
  const token = match[1]
  if (token.length > MAX_TOKEN_LENGTH) return false
  const actual = createHash('sha256').update(token, 'utf8').digest()
  const want = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(actual, want)
}

export function requestHasBotAccess(authorization: string | null | undefined): boolean {
  // Vercel дээр paste хийхэд мөрний төгсгөл наалдсан ч таарна. Хоосон бол таарахгүй.
  const expected = process.env[BOT_API_KEY_ENV]?.trim()
  return bearerMatches(authorization, expected)
}
