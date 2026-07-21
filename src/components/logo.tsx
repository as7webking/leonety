import type { CSSProperties } from 'react'

type LogoSize = 'sm' | 'md' | 'lg' | 'print'

interface LogoProps {
  alt?: string
  className?: string
  imageClassName?: string
  correctArtworkOffset?: boolean
  size?: LogoSize
  src?: string
  style?: CSSProperties
}

const sizeClasses: Record<LogoSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
  print: 'h-12 w-12',
}

export function Logo({
  alt = 'Leonety',
  className = '',
  correctArtworkOffset = true,
  imageClassName = '',
  size = 'md',
  src = '/icon-192.png',
  style,
}: LogoProps) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${sizeClasses[size]} ${className}`} style={style}>
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-contain object-center ${imageClassName}`}
        style={correctArtworkOffset ? { transform: 'translateX(-3%)', transformOrigin: 'center' } : undefined}
      />
    </span>
  )
}
