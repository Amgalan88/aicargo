import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import './globals.css'
import PwaRegister from './components/PwaRegister'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export async function generateMetadata(): Promise<Metadata> {
  let title = 'Ai cargohub — Ачаа тээвэр'
  let icon = '/favicon.svg'
  let apple = '/logo.svg'

  try {
    const h = await headers()
    const slug = h.get('x-cargo-slug')
    if (slug) {
      const cargo = await prisma.cargo.findUnique({
        where: { slug },
        select: { name: true, logoUrl: true },
      })
      if (cargo) {
        title = cargo.name
        if (cargo.logoUrl) {
          icon = '/api/cargo-icon'
          apple = '/api/cargo-icon'
        }
      }
    }
  } catch {}

  return {
    title,
    description: 'Карго бараа хянах систем',
    icons: { icon, apple },
    manifest: '/api/manifest.webmanifest',
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
