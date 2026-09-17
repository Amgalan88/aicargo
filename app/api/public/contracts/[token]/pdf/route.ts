import { NextRequest } from 'next/server'
import { bad } from '@/lib/contract-auth'
import { ACCESS_TOKEN_RE } from '@/lib/contract-server'
import { contractPdfResponse } from '@/lib/contract-pdf-response'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!ACCESS_TOKEN_RE.test(token)) return bad('Гэрээ олдсонгүй', 404)
  return contractPdfResponse({ accessToken: token, cargoId: null })
}
