'use client'
import { useEffect } from 'react'
import { captureInstallPrompt } from '@/lib/pwa-client'

export default function PwaRegister() {
  useEffect(() => {
    captureInstallPrompt()
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
