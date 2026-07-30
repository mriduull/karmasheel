import { apiFetch } from '@/api/client'
import type { ApiList } from '@/types/api'
import type { Category, CategoryTree, Subcategory } from '@/types/taxonomy'

/** GET /api/taxonomy/categories/ — public, bare array, alphabetical. */
export function fetchCategories(): Promise<ApiList<Category>> {
  return apiFetch<ApiList<Category>>('/taxonomy/categories/')
}

/** GET /api/taxonomy/subcategories/?category=<id> — public, bare array.
 * `categoryId` omitted fetches every subcategory unscoped. */
export function fetchSubcategories(categoryId?: number): Promise<ApiList<Subcategory>> {
  const query = categoryId !== undefined ? `?category=${categoryId}` : ''
  return apiFetch<ApiList<Subcategory>>(`/taxonomy/subcategories/${query}`)
}

/** GET /api/taxonomy/tree/ — public, bare array of category trees
 * (categories -> subcategories -> active skills), not a single object. */
export function fetchTaxonomyTree(): Promise<ApiList<CategoryTree>> {
  return apiFetch<ApiList<CategoryTree>>('/taxonomy/tree/')
}
