import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchTaxonomyTree } from '@/api/endpoints/taxonomy'
import type { SkillTagSummary } from '@/types/skill'
import { Button } from '@/components/primitives/Button'

interface ManualSkillPickerProps {
  id: string
  onSelect: (skill: SkillTagSummary) => void
  onCancel: () => void
}

export function ManualSkillPicker({ id, onSelect, onCancel }: ManualSkillPickerProps) {
  const categoryId = useId()
  const subcategoryId = useId()
  const skillId = useId()
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<number | null>(null)
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null)

  const taxonomyQuery = useQuery({
    queryKey: ['taxonomy', 'tree'],
    queryFn: fetchTaxonomyTree,
  })

  const selectedCategory = taxonomyQuery.data?.find(
    (category) => category.id === selectedCategoryId,
  )
  const selectedSubcategory = selectedCategory?.subcategories.find(
    (subcategory) => subcategory.id === selectedSubcategoryId,
  )
  const selectedSkill = selectedSubcategory?.skills.find((skill) => skill.id === selectedSkillId)

  if (taxonomyQuery.isLoading) {
    return <p id={id} className="text-sm text-text-secondary">Loading available skills…</p>
  }

  if (taxonomyQuery.isError) {
    return (
      <div id={id} role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger-text">
        <span>Available skills could not be loaded.</span>
        <Button type="button" variant="secondary" onClick={() => taxonomyQuery.refetch()}>
          Try again
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div id={id} className="flex flex-col gap-3 rounded-sm border border-text-secondary/20 bg-surface p-3">
      <p className="text-sm font-semibold text-text-primary">Choose a standardized skill</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={categoryId} className="text-sm font-medium text-text-primary">
            Category
          </label>
          <select
            id={categoryId}
            autoFocus
            value={selectedCategoryId ?? ''}
            onChange={(event) => {
              setSelectedCategoryId(event.target.value ? Number(event.target.value) : null)
              setSelectedSubcategoryId(null)
              setSelectedSkillId(null)
            }}
            className="min-h-touch rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary"
          >
            <option value="">Select a category</option>
            {taxonomyQuery.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={subcategoryId} className="text-sm font-medium text-text-primary">
            Subcategory
          </label>
          <select
            id={subcategoryId}
            value={selectedSubcategoryId ?? ''}
            disabled={!selectedCategory}
            onChange={(event) => {
              setSelectedSubcategoryId(event.target.value ? Number(event.target.value) : null)
              setSelectedSkillId(null)
            }}
            className="min-h-touch rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select a subcategory</option>
            {selectedCategory?.subcategories.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.id}>
                {subcategory.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={skillId} className="text-sm font-medium text-text-primary">
            Skill
          </label>
          <select
            id={skillId}
            value={selectedSkillId ?? ''}
            disabled={!selectedSubcategory}
            onChange={(event) =>
              setSelectedSkillId(event.target.value ? Number(event.target.value) : null)
            }
            className="min-h-touch rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select a skill</option>
            {selectedSubcategory?.skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!selectedSkill}
          onClick={() =>
            selectedSkill &&
            selectedSubcategory &&
            onSelect({ ...selectedSkill, subcategory: selectedSubcategory.name })
          }
        >
          Select skill
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
