import { NextRequest } from 'next/server'
import { requireSuperAdmin } from '@/lib/contract-auth'
import { contractPdfResponse } from '@/lib/contract-pdf-response'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req)
  if (auth.error) return auth.error
  return contractPdfResponse({ id: Number((await params).id) || -1 })
}
