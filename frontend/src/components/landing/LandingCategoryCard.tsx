import { Link } from 'react-router-dom'
import { Briefcase, HardHat, Home, Sparkles, Truck, UtensilsCrossed, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CategoryTree } from '@/types/taxonomy'

interface LandingCategoryCardProps {
  category: CategoryTree
}

/**
 * Purely presentational icon choice by keyword match against the
 * category's real name — never a stand-in for missing data (the taxonomy
 * API has no icon field), and falls back to a generic icon rather than
 * guessing. Deliberately broad/generic keywords so this keeps working as
 * the seeded taxonomy evolves, instead of being pinned to exact category
 * names.
 */
const ICON_KEYWORDS: Array<[RegExp, LucideIcon]> = [
  [/electric/i, Zap],
  [/construct|mason|repair|build/i, HardHat],
  [/drive|delivery|transport/i, Truck],
  [/clean|domestic|home|care/i, Home],
  [/kitchen|hospitality|cater/i, UtensilsCrossed],
]

function iconForCategory(name: string): LucideIcon {
  const match = ICON_KEYWORDS.find(([pattern]) => pattern.test(name))
  return match ? match[1] : Briefcase
}

/**
 * Landing-page-only category card — denser, icon-led presentation than
 * the shared `CategoryTile` used elsewhere, matching the reference's
 * category-grid composition. Deep-links into Job Browse pre-filtered by
 * this category, same as `CategoryTile`.
 */
export function LandingCategoryCard({ category }: LandingCategoryCardProps) {
  const Icon = iconForCategory(category.name)
  const subcategoryCount = category.subcategories.length

  return (
    <Link
      to={`/jobs?category=${category.id}`}
      className="flex min-h-touch flex-col gap-3 rounded-md border border-text-secondary/10 bg-surface p-5 shadow-card transition-colors hover:bg-surface-muted"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-surface-muted text-brand-primary">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="text-lg font-semibold text-text-primary">{category.name}</span>
      <span className="text-sm text-text-secondary">
        {subcategoryCount} {subcategoryCount === 1 ? 'subcategory' : 'subcategories'}
      </span>
    </Link>
  )
}

/** The grid's final, distinctly-styled tile — a plain link to full
 * category browsing, never a fabricated "N jobs waiting" stat. */
export function ExploreAllCategoriesCard() {
  return (
    <Link
      to="/jobs"
      className="flex min-h-touch flex-col items-start justify-center gap-2 rounded-md border-2 border-dashed border-brand-primary/40 bg-surface p-5 text-brand-primary transition-colors hover:bg-surface-muted"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-primary/10">
        <Sparkles size={22} aria-hidden="true" />
      </span>
      <span className="text-lg font-semibold">Explore all categories</span>
      <span className="text-sm text-text-secondary">See every category and subcategory</span>
    </Link>
  )
}
