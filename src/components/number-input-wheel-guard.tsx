'use client'

import { useEffect } from 'react'

export function NumberInputWheelGuard() {
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const target = event.target

      if (!(target instanceof HTMLInputElement) || target.type !== 'number') {
        return
      }

      event.preventDefault()
      target.blur()
    }

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    return () => document.removeEventListener('wheel', handleWheel, { capture: true })
  }, [])

  return null
}
