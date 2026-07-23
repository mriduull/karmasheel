import { SkeletonBlock } from './SkeletonBlock'

/** A generic card-shaped loading placeholder, composed from SkeletonBlock. */
export function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
      <SkeletonBlock className="h-5 w-2/3" />
      <SkeletonBlock className="h-4 w-full" />
      <SkeletonBlock className="h-4 w-5/6" />
    </div>
  )
}
