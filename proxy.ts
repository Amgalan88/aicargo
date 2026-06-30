import { NextRequest, NextResponse } from 'next/server'
import { getAuthUserFromRequest } from '@/lib/auth'

function getSlug(host: string): string | null {
  const hostname = host.split(':')[0]
  const parts = hostname.split('.')
  if (parts.length < 3) return null
  if (parts[0] === 'www') return null
  if (hostname.endsWith('.vercel.app')) return null
  if (hostname.endsWith('.localhost')) return parts[0]
  return parts[0]
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const host = req.headers.get('host') ?? ''
  const slug = getSlug(host)

  // Pass slug to server components via request header
  const requestHeaders = new Headers(req.headers)
  if (slug) requestHeaders.set('x-cargo-slug', slug)

  // Protect /orders
  if (pathname.startsWith('/orders')) {
    const user = getAuthUserFromRequest(req)
    if (!user) return NextResponse.redirect(new URL('/login', req.url))
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Protect /admin
  if (pathname.startsWith('/admin')) {
    const user = getAuthUserFromRequest(req)
    if (!user) return NextResponse.redirect(new URL('/login', req.url))
    if (user.role !== 'ADMIN') return NextResponse.redirect(new URL('/', req.url))
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.svg|.*\\.png|.*\\.webp).*)'],
}
