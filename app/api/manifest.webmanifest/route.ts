import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const slug = req.headers.get('x-cargo-slug')
  let name = 'Aicargo'
  let shortName = 'Aicargo'
  let hasLogo = false

  if (slug) {
    const cargo = await (prisma.cargo as any).findUnique({
      where: { slug },
      select: { name: true, logoUrl: true },
    })
    if (cargo) {
      name = cargo.name
      shortName = cargo.name.length > 12 ? cargo.name.split(' ')[0] : cargo.name
      hasLogo = !!cargo.logoUrl
    }
  }

  const manifest = {
    name,
    short_name: shortName,
    description: 'Карго бараа хянах систем',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f4ef',
    theme_color: '#c05a2a',
    orientation: 'portrait',
    icons: hasLogo
      ? [
          { src: '/api/cargo-icon', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/api/cargo-icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      : [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}
