import { useQuery } from '@tanstack/react-query'
import { fetchCategories } from '@/api/endpoints/taxonomy'

interface CategorySelectProps {
  value: number | null
  onChange: (categoryId: number | null) => void
}

export function CategorySelect({ value, onChange }: CategorySelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['taxonomy', 'categories'],
    queryFn: fetchCategories,
  })

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="job-filter-category" className="text-base font-semibold text-text-primary">
        Category
      </label>
      <select
        id="job-filter-category"
        className="min-h-touch rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        disabled={isLoading}
      >
        <option value="">All categories</option>
        {data?.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  )
}
