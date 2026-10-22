import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Апп-ын икон (favicon, утсанд суулгасан апп). Лого ямар ч харьцаатай байж болох тул Cloudinary-аар
// дөрвөлжин дэвсгэр дээр бүтнээр нь байрлуулна (дэвсгэр = логоны ирмэгийн өнгө) — хөндлөн лого тайрагдахгүй.
//   ?m=1 — maskable: Android икон дугуй/дөрвөлжин тайрдаг тул лого голын 78%-д (аюулгүй бүс)
function squareIcon(url: string, maskable: boolean): string {
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url
  const t = maskable
    ? 'c_pad,w_400,h_400,b_auto:border/c_pad,w_512,h_512,b_auto:border,f_png'
    : 'c_pad,w_512,h_512,b_auto:border,f_png'
  return url.replace('/upload/', `/upload/${t}/`)
}

export async function GET(req: NextRequest) {
  const slug = req.headers.get('x-cargo-slug')
  const maskable = req.nextUrl.searchParams.get('m') === '1'

  if (slug) {
    const cargo = await prisma.cargo.findUnique({
      where: { slug },
      select: { logoUrl: true },
    })

    if (cargo?.logoUrl) {
      try {
        // Хувиргалт амжилтгүй бол эх логог өгнө
        let res = await fetch(squareIcon(cargo.logoUrl, maskable))
        if (!res.ok) res = await fetch(cargo.logoUrl)
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
