import type { CSSProperties } from 'react'

type LogoSize = 'sm' | 'md' | 'lg' | 'xl' | 'print'
type LogoVariant = 'mark' | 'markWithName' | 'icon' | 'print'

interface LogoProps {
  alt?: string
  className?: string
  imageClassName?: string
  correctArtworkOffset?: boolean
  showName?: boolean
  size?: LogoSize
  src?: string
  style?: CSSProperties
  variant?: LogoVariant
}

const sizeClasses: Record<LogoSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
  xl: 'h-20 w-20',
  print: 'h-12 w-12',
}

const defaultLogoSrc = '/brand/leonety-logo.png'

export function Logo({
  alt = 'Leonety',
  className = '',
  correctArtworkOffset = true,
  imageClassName = '',
  showName,
  size = 'md',
  src = defaultLogoSrc,
  style,
  variant = 'mark',
}: LogoProps) {
  const shouldShowName = showName ?? variant === 'markWithName'

  return (
    <span className={`inline-flex shrink-0 items-center gap-2 ${className}`} style={style}>
      <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${sizeClasses[size]}`}>
        <img
          src={variant === 'icon' ? '/brand/icon-192.png' : src}
          alt={alt}
          className={`h-full w-full object-contain object-center ${imageClassName}`}
          style={correctArtworkOffset ? { transform: 'translateX(-6%)', transformOrigin: 'center' } : undefined}
        />
      </span>
      {shouldShowName && <span className="font-semibold tracking-tight text-slate-950">Leonety</span>}
    </span>
  )
}

export const LeonetyLogo = Logo
