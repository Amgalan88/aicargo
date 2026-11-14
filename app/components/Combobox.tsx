'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { reduceComboKey, type ComboKeyState } from '@/lib/combobox-keys'
import type { ComboOption } from './customer-suggest'

const DEBOUNCE_MS = 200

export default function Combobox({
  value,
  onChange,
  onPick,
  load,
  placeholder,
  ariaLabel,
  className = 'input',
  required = false,
  inputMode,
  minChars = 1,
  describedBy,
}: {
  value: string
  onChange: (value: string) => void
  onPick?: (option: ComboOption) => void
  load: (query: string, signal: AbortSignal) => Promise<ComboOption[]>
  placeholder?: string
  ariaLabel: string
  className?: string
  required?: boolean
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  minChars?: number
  describedBy?: string
}) {
  const uid = useId()
  const listId = `${uid}-list`
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ComboOption[]>([])
  const [active, setActive] = useState(-1)
  const loadRef = useRef(load)
  const skipQuery = useRef<string | null>(null)
  loadRef.current = load

  useEffect(() => {
    if (skipQuery.current === value) {
      skipQuery.current = null
      return
    }
    const q = value.trim()
    if (q.length < minChars) {
      setOptions([])
      setOpen(false)
      setActive(-1)
      return
    }
    const ac = new AbortController()
    const timer = window.setTimeout(() => {
      loadRef.current(q, ac.signal).then(next => {
        if (ac.signal.aborted) return
        setOptions(next)
        setActive(-1)
        setOpen(next.length > 0)
      }).catch(() => {})
    }, DEBOUNCE_MS)
    return () => {
      ac.abort()
      window.clearTimeout(timer)
    }
  }, [value, minChars])

  useEffect(() => {
    if (!open || active < 0) return
    document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, uid])

  function choose(index: number) {
    const opt = options[index]
    if (!opt) return
    skipQuery.current = opt.value
    onChange(opt.value)
    onPick?.(opt)
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const state: ComboKeyState = { open: open && options.length > 0, active, count: options.length }
    const result = reduceComboKey(state, e.key, {
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      composing: e.nativeEvent.isComposing,
    })
    setOpen(result.state.open)
    setActive(result.state.active)
    if (result.action.type === 'select') choose(result.action.index)
    if (result.prevent) e.preventDefault()
  }

  const expanded = open && options.length > 0
  const activeId = expanded && active >= 0 ? `${uid}-opt-${active}` : undefined

  return (
    <div className="cb">
      <input
        className={className}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-describedby={describedBy}
        placeholder={placeholder}
        value={value}
        required={required}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {expanded && (
        <ul className="cb-list" id={listId} role="listbox" aria-label={ariaLabel}>
          {options.map((opt, i) => (
            <li
              key={opt.id}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className="cb-opt"
              onMouseEnter={() => setActive(i)}
              onPointerDown={e => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span>{opt.label}</span>
              {opt.hint && opt.hint !== opt.label && <small>{opt.hint}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
