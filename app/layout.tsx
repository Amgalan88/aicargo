import type { Metadata } from 'next'
import './globals.css'
import PwaRegister from './components/PwaRegister'

export const metadata: Metadata = {
  title: 'Ai cargohub — Ачаа тээвэр',
  description: 'Карго бараа хянах систем',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
  icons: { icon: '/favicon.svg', apple: '/logo.svg' },
  manifest: '/api/manifest.webmanifest',
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
