'use client'
import { useRef } from 'react'

// First non-empty list only. Later pages, filters, and re-renders do not replay.
export function useInitialEnter<T>(items: readonly T[], idOf: (item: T) => string | number) {
  const ids = useRef<Set<string> | null>(null)
  if (ids.current === null && items.length > 0) {
    ids.current = new Set(items.slice(0, 10).map(item => String(idOf(item))))
  }
  return (itemId: string | number, index: number) =>
    index < 10 && (ids.current?.has(String(itemId)) ?? false)
}
