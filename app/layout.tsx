import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Analytics } from '@vercel/analytics/next'
import { prisma } from '@/lib/prisma'
import './globals.css'
import PwaRegister from './components/PwaRegister'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export async function generateMetadata(): Promise<Metadata> {
  let title = 'AiCargo — Карго менежментийн систем | Ачаа бүртгэл, хяналт'
  let ogTitle = 'Карго бизнесээ 5 минутад онлайн болго'
  let ogSub = 'aicargo.mn · Эхний 30 хоног үнэгүй'
  let description = 'Карго бизнесээ 5 минутад онлайн болго — өөрийн вэб хаягтай ачаа бүртгэл, хяналтын систем. Эрээн агуулахаас олголт хүртэл, AI туслахтай. Эхний 30 хоног үнэгүй.'
  let icon = '/favicon.svg'
  let apple = '/apple-icon.png'
  let baseUrl = 'https://www.aicargo.mn'
  // Үндсэн домэйнд л хайлтын түлхүүр үгс өгнө (каргогийн subdomain-д хэрэггүй)
  let keywords: string[] | undefined = [
    'карго систем', 'карго программ', 'ачаа бүртгэл', 'ачаа хяналт',
    'карго менежмент', 'Эрээн карго', 'карго нээх', 'cargo tracking', 'AiCargo',
  ]

  try {
    const h = await headers()
    const host = h.get('host')
    if (host) baseUrl = `https://${host.split(':')[0]}`
    const slug = h.get('x-cargo-slug')
    if (slug) {
      const cargo = await prisma.cargo.findUnique({
        where: { slug },
        select: { name: true, logoUrl: true },
      })
      if (cargo) {
        title = cargo.name
        ogTitle = cargo.name
        ogSub = `${slug}.aicargo.mn · Ачаа хянах систем`
        description = `${cargo.name} — ачаагаа трак кодоор хянах, бүртгэх систем`
        keywords = undefined
        if (cargo.logoUrl) {
          icon = '/api/cargo-icon'
          apple = '/api/cargo-icon'
        }
      }
    }
  } catch {}

  const ogImage = `${baseUrl}/api/og?title=${encodeURIComponent(ogTitle)}&sub=${encodeURIComponent(ogSub)}`

  return {
    title,
    description,
    keywords,
    icons: { icon, apple },
    manifest: '/api/manifest.webmanifest',
    openGraph: {
      title: ogTitle,
      description,
      url: baseUrl,
      siteName: 'Ai cargohub',
      locale: 'mn_MN',
      type: 'website',
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [ogImage],
    },
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='night'||t==='comfort')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        <PwaRegister />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
