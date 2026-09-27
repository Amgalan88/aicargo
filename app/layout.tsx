import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Analytics } from '@vercel/analytics/next'
import { Inter } from 'next/font/google'
import { prisma } from '@/lib/prisma'
import './globals.css'
import PwaRegister from './components/PwaRegister'
import AppToaster from './components/AppToaster'
import { ConfirmHost } from './components/ConfirmDialog'
import DemoBanner from './components/DemoBanner'
import { DEMO_SLUG } from '@/lib/demo'

// Кирилл үсэгтэй нэг фонт — Windows/Android/iOS дээр ижил харагдана
const inter = Inter({ subsets: ['latin', 'cyrillic'], variable: '--font-sans', display: 'swap' })

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
  // Демог хайлтын индексээс гаргана — жинхэнэ үйлчлүүлэгч андуурч ороход хүргэдэг
  let noIndex = false
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
    if (slug === DEMO_SLUG) noIndex = true
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
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const isDemo = (await headers()).get('x-cargo-slug') === DEMO_SLUG

  return (
    <html lang="mn" className={inter.variable} suppressHydrationWarning>
      <body>
        {/* Landing (/) нь нэвтрээгүй зочдод зориулсан танилцуулга тул хэрэглэгчийн
            өмнө хадгалсан горим (шөнийн/нүдэнд ээлтэй) энд нөлөөлөхгүй — үргэлж нэг өнгөтэй */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(location.pathname!=='/'){var t=localStorage.getItem('theme');if(t==='night'||t==='comfort')document.documentElement.dataset.theme=t}}catch(e){}`,
          }}
        />
        <PwaRegister />
        {isDemo && <DemoBanner />}
        {children}
        <AppToaster />
        <ConfirmHost />
        <Analytics />
      </body>
    </html>
  )
}
