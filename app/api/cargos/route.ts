import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const cargos = await prisma.cargo.findMany({
    select: { id: true, name: true, logoUrl: true } as any,
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(cargos)
}
