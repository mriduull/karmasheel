import { Camera } from 'lucide-react'

interface PhotoPlaceholderProps {
  /** What real photography would show here — always rendered visibly
   * (not only in the accessible name), so it reads as a placeholder to
   * every viewer, not just screen-reader users. */
  caption: string
  toneA?: string
  toneB?: string
  className?: string
}

/**
 * Stands in for real photography (Karmasheel Design Constitution §42 —
 * real people doing real local work) until real images exist. A duotone
 * halftone treatment, not a fabricated photo — swapping in a real `<img>`
 * later only touches this one component.
 */
export function PhotoPlaceholder({
  caption,
  toneA = 'var(--color-brand-primary)',
  toneB = 'var(--color-text-primary)',
  className = '',
}: PhotoPlaceholderProps) {
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
    </div>
  )
}
