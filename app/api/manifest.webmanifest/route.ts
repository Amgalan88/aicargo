import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Утсанд суулгасан апп-ын нэр (icon-ы доор ~12 тэмдэгт харагдана).
// „Эрээнээс MGL карго · Кино үйлдвэр салбар“ шиг салбарын нэр бол „·“-ийн дараах байршил: „Кино үйлдвэр карго“
function appShortName(name: string): string {
  const branch = name.includes('·') ? name.split('·').pop()!.replace(/салбар/gi, '').replace(/s+/g, ' ').trim() : ''
  if (branch) return /карго|cargo/i.test(branch) ? branch : `${branch} карго`
  return name.length > 12 ? name.split(' ')[0] : name
}

export async function GET(req: NextRequest) {
  const slug = req.headers.get('x-cargo-slug')
  let name = 'Aicargo'
  let shortName = 'Aicargo'
  let hasLogo = false
  let brand: string | null = null

  if (slug) {
    const cargo = await (prisma.cargo as any).findUnique({
      where: { slug },
      select: { name: true, logoUrl: true, brandTheme: true },
    })
    if (cargo) {
      name = cargo.name
      shortName = appShortName(cargo.name)
      hasLogo = !!cargo.logoUrl
      brand = cargo.brandTheme ?? null
    }
  }

  const manifest = {
    name,
    short_name: shortName,
    description: 'Карго бараа хянах систем',
    id: '/',
    // Суулгасан апп шууд "Миний ачаа" нээгдэнэ (нэвтрээгүй бол нэвтрэх рүү шилжинэ)
    start_url: slug ? '/orders' : '/',
    scope: '/',
    display: 'standalone',
    // Брэндтэй бол брэндбүүкийн өнгө (mgl: сүүн цагаан дэвсгэр, тэнгэр хөх)
    background_color: brand === 'mgl' ? '#F6EFE3' : '#f5f4ef',
    theme_color: brand === 'mgl' ? '#002D72' : '#c05a2a',
    orientation: 'portrait',
    icons: hasLogo
      ? [
          // Лого дөрвөлжин дэвсгэр дээр бүтнээрээ (cargo-icon); maskable — голын 78%-д, Android тайрахад хасагдахгүй
          { src: '/api/cargo-icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/api/cargo-icon?m=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
