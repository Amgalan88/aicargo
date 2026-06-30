import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET!
const COOKIE_NAME = 'cargo_token'

export interface JwtPayload {
  userId: number
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  cargoId: number | null
  tokenVersion?: number
}

export function signToken(payload: JwtPayload, expiresIn = '7d'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return null
  }
}

export function setAuthCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
}

export function clearAuthCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
}

export async function getAuthUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { tokenVersion: true },
  })
  if (!user || user.tokenVersion !== (payload.tokenVersion ?? 0)) return null
  return payload
}

export function getAuthUserFromRequest(req: NextRequest): JwtPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

export async function getVerifiedUserFromRequest(req: NextRequest): Promise<JwtPayload | null> {
  const payload = getAuthUserFromRequest(req)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { tokenVersion: true },
  })
  if (!user || user.tokenVersion !== (payload.tokenVersion ?? 0)) return null
  return payload
}

export function unauthorized() {
  return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ error: 'Хандах эрх байхгүй' }, { status: 403 })
}
