'use client'
import { useState, useEffect, useCallback } from 'react'
import type { UserLang } from '@/lib/user-i18n'
import { rememberLangForPush } from '@/lib/pwa-client'

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
        if (v === 'en' || v === 'cn' || v === 'mn') { setLangState(v); rememberLangForPush(v) }
      } catch {}
    }
    read()
    window.addEventListener(EVENT, read)
    return () => window.removeEventListener(EVENT, read)
  }, [])

  const setLang = useCallback((l: UserLang) => {
    try { localStorage.setItem(KEY, l) } catch {}
    rememberLangForPush(l)
    setLangState(l)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return [lang, setLang]
}
