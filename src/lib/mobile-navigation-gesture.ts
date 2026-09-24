export const NAVIGATION_EDGE_WIDTH = 24
export const NAVIGATION_OPEN_THRESHOLD = 72
export const NAVIGATION_CLOSE_THRESHOLD = 64

export interface NavigationSwipe {
  startX: number
  startY: number
  endX: number
  endY: number
}

function isDeliberateHorizontalSwipe(swipe: NavigationSwipe) {
  const horizontalDistance = Math.abs(swipe.endX - swipe.startX)
  const verticalDistance = Math.abs(swipe.endY - swipe.startY)
  return horizontalDistance > verticalDistance * 1.25
}

export function shouldOpenNavigationDrawer(swipe: NavigationSwipe) {
  return swipe.startX <= NAVIGATION_EDGE_WIDTH
    && swipe.endX - swipe.startX >= NAVIGATION_OPEN_THRESHOLD
    && isDeliberateHorizontalSwipe(swipe)
}

export function shouldCloseNavigationDrawer(swipe: NavigationSwipe) {
  return swipe.startX - swipe.endX >= NAVIGATION_CLOSE_THRESHOLD
    && isDeliberateHorizontalSwipe(swipe)
}
