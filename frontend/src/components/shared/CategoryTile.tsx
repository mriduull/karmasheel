import { Link } from 'react-router-dom'
import type { CategoryTree } from '@/types/taxonomy'

interface CategoryTileProps {
  category: CategoryTree
}

/** Landing-page category teaser tile — deep-links into Job Browse
 * pre-filtered by this category (JobBrowse reads `?category=` from the URL). */
export function CategoryTile({ category }: CategoryTileProps) {
  const subcategoryCount = category.subcategories.length

  return (
    <Link
      to={`/jobs?category=${category.id}`}
      className="flex min-h-touch flex-col gap-1 rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card transition-colors hover:bg-surface-muted"
    >
      <span className="text-lg font-semibold text-text-primary">{category.name}</span>
      <span className="text-sm text-text-secondary">
        {subcategoryCount} {subcategoryCount === 1 ? 'subcategory' : 'subcategories'}
      </span>
    </Link>
  )
}
