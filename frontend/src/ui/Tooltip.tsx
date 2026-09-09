import { useEffect, useRef, useState } from 'react'

/* Global tooltips. Native `title` bubbles cannot be styled, so any element
   with a `data-tip` attribute gets a themed bubble instead: on hover (after
   a short delay) and on keyboard focus. One listener for the whole app;
   the bubble is position: fixed, so scroll containers never clip it.

   Usage: <button data-tip="Switch workspace">…</button>
   Keep an aria-label on icon-only controls — the tip is visual only. */

const SHOW_DELAY = 350
const GAP = 8

interface TipState {
  text: string
  x: number
  y: number
  /** Bubble sits above the element when there is no room below. */
  above: boolean
}

function tipTarget(el: EventTarget | null): HTMLElement | null {
  if (!(el instanceof Element)) return null
  return el.closest<HTMLElement>('[data-tip]')
}

export function TooltipLayer() {
  const [tip, setTip] = useState<TipState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const clear = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      current.current = null
      setTip(null)
    }

    const show = (el: HTMLElement) => {
      const text = el.dataset.tip?.trim()
      if (!text) return
      const r = el.getBoundingClientRect()
      const above = r.bottom + 48 > window.innerHeight
      setTip({
        text,
        x: Math.min(Math.max(r.left + r.width / 2, 12), window.innerWidth - 12),
        y: above ? r.top - GAP : r.bottom + GAP,
        above,
      })
    }

    const onOver = (e: MouseEvent) => {
      const el = tipTarget(e.target)
      if (!el || el === current.current) return
      if (timer.current) clearTimeout(timer.current)
      current.current = el
      timer.current = setTimeout(() => show(el), SHOW_DELAY)
    }
    const onOut = (e: MouseEvent) => {
      const el = tipTarget(e.target)
      if (!el || el !== current.current) return
      // Still inside the same element (moved between its children)?
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return
      clear()
    }
    const onFocus = (e: FocusEvent) => {
      const el = tipTarget(e.target)
      if (!el) return
      current.current = el
      show(el)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', clear)
    document.addEventListener('mousedown', clear)
    document.addEventListener('scroll', clear, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', clear)
      document.removeEventListener('mousedown', clear)
      document.removeEventListener('scroll', clear, true)
      window.removeEventListener('keydown', onKey)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  if (!tip) return null
  return (
    <div
      className={`tooltip${tip.above ? ' above' : ''}`}
      role="tooltip"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  )
}
