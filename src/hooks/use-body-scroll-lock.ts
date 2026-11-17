'use client'

import { useEffect } from 'react'

type LockBody = { style: Pick<CSSStyleDeclaration, 'overflow' | 'position' | 'top' | 'width' | 'paddingRight'> }
type LockDocumentElement = Pick<HTMLElement, 'clientWidth'>
type LockWindow = { innerWidth: number; scrollY: number; scrollTo: (x: number, y: number) => void }

export function createBodyScrollLockController() {
  let activeLocks = 0
  let restore: (() => void) | null = null

  return {
    acquire(body: LockBody, documentElement: LockDocumentElement, view: LockWindow) {
      if (activeLocks === 0) {
        const scrollY = view.scrollY
        const scrollbarWidth = view.innerWidth - documentElement.clientWidth
        const previous = {
          overflow: body.style.overflow,
          position: body.style.position,
          top: body.style.top,
          width: body.style.width,
          paddingRight: body.style.paddingRight,
        }

        body.style.overflow = 'hidden'
        body.style.position = 'fixed'
        body.style.top = `-${scrollY}px`
        body.style.width = '100%'
        if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`

        restore = () => {
          body.style.overflow = previous.overflow
          body.style.position = previous.position
          body.style.top = previous.top
          body.style.width = previous.width
          body.style.paddingRight = previous.paddingRight
          view.scrollTo(0, scrollY)
        }
      }

      activeLocks += 1
      let released = false
      return () => {
        if (released) return
        released = true
        activeLocks = Math.max(0, activeLocks - 1)
        if (activeLocks === 0) {
          restore?.()
          restore = null
        }
      }
    },
  }
}

const bodyScrollLockController = createBodyScrollLockController()

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof window === 'undefined') return
    return bodyScrollLockController.acquire(document.body, document.documentElement, window)
  }, [locked])
}
