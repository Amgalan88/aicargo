'use client'
import { useState, useEffect, useCallback } from 'react'
import type { UserLang } from '@/lib/user-i18n'

const KEY = 'user-lang'
const EVENT = 'user-lang-changed'

// SSR үед үргэлж 'mn' — mount дараа localStorage-оос уншина (hydration аюулгүй).
// Олон компонент (OrdersClient + UserAIWidget) event-ээр зэрэг шинэчлэгдэнэ.
export function useUserLang(): [UserLang, (l: UserLang) => void] {
  const [lang, setLangState] = useState<UserLang>('mn')

  useEffect(() => {
    function read() {
      try {
        const v = localStorage.getItem(KEY)
        if (v === 'en' || v === 'cn' || v === 'mn') setLangState(v)
      } catch {}
    }
    read()
    window.addEventListener(EVENT, read)
    return () => window.removeEventListener(EVENT, read)
  }, [])

  const setLang = useCallback((l: UserLang) => {
    try { localStorage.setItem(KEY, l) } catch {}
    setLangState(l)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [lang, setLang]
}
