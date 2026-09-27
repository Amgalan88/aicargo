'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Тийм',
  cancelLabel = 'Болих',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Нээгдэхэд cancel товч руу focus оноох + Esc-ээр хаах
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onCancel])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCancel}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 14,
              maxWidth: 420, width: '100%', padding: '1.4rem 1.4rem 1.2rem',
              border: '1px solid var(--border)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text)' }}>
              {title}
            </h3>
            {message && (
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '1.2rem', whiteSpace: 'pre-line', maxHeight: '50vh', overflowY: 'auto' }}>
                {message}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: message ? 0 : '1rem' }}>
              <button
                ref={cancelRef}
                onClick={onCancel}
                disabled={loading}
                className="btn-ghost"
                style={{ padding: '0.6rem 1.2rem', fontSize: '0.85rem' }}
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="btn"
                style={{
                  padding: '0.6rem 1.2rem', fontSize: '0.85rem',
                  ...(danger ? { background: 'var(--danger)' } : {}),
                }}
              >
                {loading ? '...' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Императив API: `if (!(await confirmAsync('Устгах уу?'))) return` ──
// Native confirm()-ийн оронд — брэндийн өнгөтэй, шөнийн горимд зохицсон, Esc/focus-той.
// <ConfirmHost /> root layout-д нэг удаа суусан байна.

type ConfirmOptions = {
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

let showConfirm: ((p: Pending) => void) | null = null

const DANGER_WORDS = /устга|цуцла|гарах|remove|delete/i

export function confirmAsync(input: string | ConfirmOptions): Promise<boolean> {
  const opts: ConfirmOptions = typeof input === 'string'
    // Богино текст бол гарчиг, урт бол тайлбар болгоно
    ? (input.length <= 70 && !input.includes('\n') ? { title: input } : { title: 'Баталгаажуулах', message: input })
    : input
  if (opts.danger === undefined) opts.danger = DANGER_WORDS.test(`${opts.title ?? ''} ${opts.message ?? ''}`)
  // Host суугаагүй (жш тест) үед native руу унана
  if (!showConfirm) return Promise.resolve(window.confirm([opts.title, opts.message].filter(Boolean).join('\n\n')))
  return new Promise(resolve => showConfirm!({ ...opts, resolve }))
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    showConfirm = p => setPending(prev => { prev?.resolve(false); return p })
    return () => { showConfirm = null }
  }, [])

  const close = useCallback((ok: boolean) => {
    setPending(prev => { prev?.resolve(ok); return null })
  }, [])
  const onCancel = useCallback(() => close(false), [close])

  return (
    <ConfirmDialog
      open={!!pending}
      title={pending?.title ?? ''}
      message={pending?.message}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      danger={pending?.danger}
      onConfirm={() => close(true)}
      onCancel={onCancel}
    />
  )
}
