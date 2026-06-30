import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const slug = req.headers.get('x-cargo-slug')

  if (slug) {
    const cargo = await (prisma.cargo as any).findUnique({
      where: { slug },
      select: { logoUrl: true },
    })

    if (cargo?.logoUrl) {
      try {
        const res = await fetch(cargo.logoUrl)
        if (res.ok) {
          const buf = await res.arrayBuffer()
          const contentType = res.headers.get('content-type') ?? 'image/png'
          return new Response(buf, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=300',
            },
          })
        }
      } catch {}
    }
  }

  // Fallback: redirect to default icon
  return Response.redirect(new URL('/icon-192.png', req.url))
}
