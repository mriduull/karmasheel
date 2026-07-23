import { useQuery } from '@tanstack/react-query'
import { fetchSubcategories } from '@/api/endpoints/taxonomy'

interface SubcategorySelectProps {
  categoryId: number | null
  value: number | null
  onChange: (subcategoryId: number | null) => void
}

/** Disabled until a category is chosen — a subcategory only makes sense
 * scoped to one category (`GET /api/taxonomy/subcategories/?category=`). */
export function SubcategorySelect({ categoryId, value, onChange }: SubcategorySelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['taxonomy', 'subcategories', categoryId],
    queryFn: () => fetchSubcategories(categoryId ?? undefined),
    enabled: categoryId !== null,
  })

  const isDisabled = categoryId === null || isLoading

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="job-filter-subcategory" className="text-base font-semibold text-text-primary">
        Subcategory
      </label>
      <select
        id="job-filter-subcategory"
        className="min-h-touch rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        disabled={isDisabled}
      >
        <option value="">
          {categoryId === null ? 'Select a category first' : 'All subcategories'}
        </option>
        {data?.map((subcategory) => (
          <option key={subcategory.id} value={subcategory.id}>
            {subcategory.name}
          </option>
        ))}
      </select>
    </div>
  )
}
