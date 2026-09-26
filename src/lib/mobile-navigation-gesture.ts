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

export function shouldCloseNavigationDrawer(swipe: NavigationSwipe) {
  return swipe.startX - swipe.endX >= NAVIGATION_CLOSE_THRESHOLD
    && isDeliberateHorizontalSwipe(swipe)
}
