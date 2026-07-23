interface SkeletonBlockProps {
  className?: string
}

/** Rounded, low-opacity pulse block — never a bare spinner for content-bearing views. */
export function SkeletonBlock({ className = 'h-4 w-full' }: SkeletonBlockProps) {
  return (
    <div
      className={`animate-pulse rounded-sm bg-surface-muted ${className}`}
      aria-hidden="true"
    />
  )
}
