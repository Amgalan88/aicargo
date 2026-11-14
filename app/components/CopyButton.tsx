'use client'
import { useEffect, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

// Clipboard API (HTTPS / secure context) → байхгүй эсвэл хориглосон бол textarea + execCommand fallback
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;left:-9999px;top:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

const COPIED_MS = 1500

// Трак дугаар хуулах: 44×44 дарах талбай, 16px icon. Хуулсны дараа 1.5с ногоон check + «Хуулагдлаа».
// showText=true үед трак текстийг өөрийг нь бас харуулж, дарахад хуулна (мөр дэлгэхгүй — stopPropagation).
export default function CopyButton({ text, showText = false, textClassName, textStyle }: {
  text: string
  showText?: boolean
  textClassName?: string
  textStyle?: React.CSSProperties
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function onCopy(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault()
    e.stopPropagation()
    const ok = await writeClipboard(text)
    if (!ok) {
      toast.error('Хуулж чадсангүй')
      return
    }
    setCopied(true)
    toast.success('Хуулагдлаа')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
  }

  const button = (
    <button
      type="button"
      className={`copy-btn${copied ? ' is-copied' : ''}`}
      onClick={onCopy}
      // Мөрийн Enter/Space дэлгэлтэд хүрэхгүй
      onKeyDown={e => e.stopPropagation()}
      aria-label={copied ? 'Хуулагдлаа' : 'Трак дугаар хуулах'}
      title="Хуулах"
      data-copied={copied ? 'true' : undefined}
    >
      {copied
        ? <Check size={16} strokeWidth={2.4} aria-hidden />
        : <Copy size={16} strokeWidth={2} aria-hidden />}
    </button>
  )

  if (!showText) return button
  return (
    <>
      <span className={textClassName} style={textStyle} onClick={onCopy} title="Хуулах" data-copy-text="">{text}</span>
      {button}
    </>
  )
}
