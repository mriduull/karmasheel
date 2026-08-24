import type { ReactNode } from 'react'
import { Camera } from 'lucide-react'

interface PhotoPlaceholderProps {
  /** What real photography would show here — always rendered visibly
   * (not only in the accessible name), so it reads as a placeholder to
   * every viewer, not just screen-reader users. */
  caption: string
  toneA?: string
  toneB?: string
  className?: string
  /**
   * `'card'` (default) — the original rounded-rectangle duotone card, for
   * two-column image+copy promo sections.
   * `'cutout'` — a bottom-anchored, cardless slot sized and positioned for
   * a future isolated/transparent-background subject (e.g. the landing
   * hero's worker image) — no border, no background rectangle, so a real
   * `<img>` (or `<picture>`) can later replace only this element's
   * children without any layout rework. `children` (e.g. floating stat
   * chips) render absolutely-positioned over the slot in both variants.
   */
  variant?: 'card' | 'cutout'
  children?: ReactNode
}

/**
 * Stands in for real photography (Karmasheel Design Constitution §42 —
 * real people doing real local work) until real images exist. Swapping in
 * a real `<img>` later only touches this one component.
 */
export function PhotoPlaceholder({
  caption,
  toneA = 'var(--color-brand-primary)',
  toneB = 'var(--color-text-primary)',
  className = '',
  variant = 'card',
  children,
}: PhotoPlaceholderProps) {
  if (variant === 'cutout') {
    return (
      <div className={`relative flex items-end justify-center overflow-visible ${className}`}>
        <div
          role="img"
          aria-label={caption}
          className="h-[85%] w-[70%] rounded-t-full opacity-90"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1.6px), linear-gradient(180deg, ${toneA}, ${toneB})`,
            backgroundSize: '14px 14px, cover',
          }}
        />
        <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs italic text-white">
          <Camera size={14} aria-hidden="true" />
          {caption}
        </span>
        {children}
      </div>
    )
  }

  return (
    <div
      role="img"
      aria-label={caption}
      className={`relative overflow-hidden rounded-md ${className}`}
      style={{
        backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1.6px), linear-gradient(135deg, ${toneA}, ${toneB})`,
        backgroundSize: '14px 14px, cover',
      }}
    >
      <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs italic text-white">
        <Camera size={14} aria-hidden="true" />
        {caption}
      </span>
      {children}
    </div>
  )
}
