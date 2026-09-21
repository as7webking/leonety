export type AppSelectPlacement = 'bottom' | 'top' | 'auto'

interface AppSelectPositionInput {
  rect: { top: number; bottom: number; left: number; width: number }
  viewportWidth: number
  viewportHeight: number
  optionCount: number
  placement: AppSelectPlacement
}

export interface AppSelectPosition {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
  openAbove: boolean
}

export function calculateAppSelectPosition({
  rect,
  viewportWidth,
  viewportHeight,
  optionCount,
  placement,
}: AppSelectPositionInput): AppSelectPosition {
  const padding = 12
  const offset = 6
  const maximumHeight = 288
  const estimatedOptionHeight = 36
  const menuPadding = 8
  const availableBelow = Math.max(0, viewportHeight - rect.bottom - padding - offset)
  const availableAbove = Math.max(0, rect.top - padding - offset)
  const desiredHeight = Math.min(maximumHeight, Math.max(estimatedOptionHeight + menuPadding, optionCount * estimatedOptionHeight + menuPadding))

  const openAbove = placement === 'top'
    ? availableAbove >= desiredHeight || availableAbove > availableBelow
    : placement === 'bottom'
      ? availableBelow < desiredHeight && availableAbove > availableBelow
      : availableBelow < desiredHeight && availableAbove > availableBelow

  const availableHeight = openAbove ? availableAbove : availableBelow
  const width = Math.min(rect.width, Math.max(0, viewportWidth - padding * 2))
  const left = Math.min(Math.max(padding, rect.left), Math.max(padding, viewportWidth - width - padding))

  return {
    left,
    width,
    maxHeight: Math.max(40, Math.min(maximumHeight, availableHeight)),
    openAbove,
    ...(openAbove
      ? { bottom: viewportHeight - rect.top + offset }
      : { top: rect.bottom + offset }),
  }
}
