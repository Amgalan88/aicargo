'use client'
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'

export default function AppToaster() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    function update() {
      const t = document.documentElement.dataset.theme
      setTheme(t === 'night' ? 'dark' : 'light')
    }
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return (
    <Toaster
      theme={theme}
      position="bottom-center"
      toastOptions={{
        style: { fontFamily: 'inherit', fontSize: '0.85rem' },
      }}
      richColors
      closeButton
    />
  )
}
